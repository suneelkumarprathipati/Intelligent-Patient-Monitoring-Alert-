#!/usr/bin/env python3
"""
Basic tests for AI Drive FUSE implementation
"""

import pytest
import tempfile
from pathlib import Path

from aidrive_fuse.config import Config, parse_size
from aidrive_fuse.cache_manager import MetadataCache, DataCache
from aidrive_fuse.operation_queue import OperationQueue, OperationType, QueuedOperation


class TestConfig:
    """Test configuration management."""

    def test_parse_size(self) -> None:
        """Test size parsing."""
        assert parse_size("1024") == 1024
        assert parse_size("1K") == 1024
        assert parse_size("1M") == 1024 * 1024
        assert parse_size("1G") == 1024 * 1024 * 1024
        assert parse_size("2.5G") == int(2.5 * 1024 * 1024 * 1024)

    def test_config_defaults(self) -> None:
        """Test default configuration values."""
        config = Config()
        assert config.cache_size == 1024 * 1024 * 1024  # 1GB
        assert config.cache_ttl == 300
        assert config.max_concurrent_uploads == 5
        assert config.max_concurrent_downloads == 10

    def test_config_validation(self) -> None:
        """Test configuration validation."""
        config = Config()
        assert config.validate() is True

        # Invalid cache size
        config.cache_size = -1
        assert config.validate() is False


class TestMetadataCache:
    """Test metadata caching."""

    def test_cache_operations(self) -> None:
        """Test basic cache operations."""
        cache = MetadataCache(ttl=1)  # 1 second TTL

        # Mock file attributes
        class MockAttrs:
            def __init__(self, name: str) -> None:
                self.name = name

        attrs = MockAttrs("test.txt")

        # Cache and retrieve
        cache.cache_file_attrs("/test.txt", attrs)
        retrieved = cache.get_file_attrs("/test.txt")
        assert retrieved is not None and retrieved.name == "test.txt"

        # Test expiration (would need time mock for proper testing)
        cache.invalidate("/test.txt")
        retrieved = cache.get_file_attrs("/test.txt")
        assert retrieved is None

    def test_directory_listing_cache(self) -> None:
        """Test directory listing cache."""
        cache = MetadataCache()

        entries = ["file1.txt", "file2.txt", "subdir"]
        cache.cache_dir_listing("/", entries)

        retrieved = cache.get_dir_listing("/")
        assert retrieved == entries

        cache.invalidate_dir_listing("/")
        retrieved = cache.get_dir_listing("/")
        assert retrieved is None


class TestDataCache:
    """Test data caching."""

    def test_cache_paths(self) -> None:
        """Test cache path generation."""
        with tempfile.TemporaryDirectory() as temp_dir:
            cache = DataCache(temp_dir, max_size=1024*1024)  # 1MB

            # Test cache path generation
            cache_path = cache._get_cache_path("/test.txt")
            assert cache_path.parent == Path(temp_dir)
            assert cache_path.name.endswith(".cache")

    def test_create_cached_file(self) -> None:
        """Test creating cached files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            cache = DataCache(temp_dir, max_size=1024*1024)

            # Create cached file
            cached_path = cache.create_cached_file("/test.txt")
            assert Path(cached_path).exists()
            assert "/test.txt" in cache._dirty_files

    def test_dirty_file_tracking(self) -> None:
        """Test dirty file tracking."""
        with tempfile.TemporaryDirectory() as temp_dir:
            cache = DataCache(temp_dir, max_size=1024*1024)

            cache.mark_dirty("/test.txt")
            assert "/test.txt" in cache._dirty_files

            cache.mark_clean("/test.txt")
            assert "/test.txt" not in cache._dirty_files


class TestOperationQueue:
    """Test operation queue management."""

    @pytest.mark.asyncio
    async def test_queue_operations(self) -> None:
        """Test queuing operations."""
        queue = OperationQueue(max_concurrent_uploads=2, max_concurrent_downloads=2)

        # Queue upload
        success = await queue.queue_upload("/local/test.txt", "/remote/test.txt")
        assert success is True
        assert len(queue.upload_queue) == 1

        # Queue download
        success = await queue.queue_download("/remote/test.txt", "/local/test.txt")
        assert success is True
        assert len(queue.download_queue) == 1

    @pytest.mark.asyncio
    async def test_operation_deduplication(self) -> None:
        """Test operation deduplication."""
        queue = OperationQueue()

        # Queue same file twice
        await queue.queue_upload("/local/test.txt", "/remote/test.txt")
        await queue.queue_upload("/local/test2.txt", "/remote/test.txt")  # Same remote path

        # Should only have one operation
        assert len(queue.upload_queue) == 1
        assert len(queue.pending_uploads) == 1

    def test_queued_operation(self) -> None:
        """Test queued operation structure."""
        op = QueuedOperation(
            operation_type=OperationType.UPLOAD,
            local_path="/local/test.txt",
            remote_path="/remote/test.txt",
            priority=5
        )

        assert op.operation_type == OperationType.UPLOAD
        assert op.local_path == "/local/test.txt"
        assert op.remote_path == "/remote/test.txt"
        assert op.priority == 5
        assert op.retry_count == 0


class TestUtils:
    """Test utility functions."""

    def test_format_size(self) -> None:
        """Test size formatting."""
        from aidrive_fuse.utils import format_size

        assert format_size(0) == "0B"
        assert format_size(1024) == "1.0KB"
        assert format_size(1024 * 1024) == "1.0MB"
        assert format_size(1024 * 1024 * 1024) == "1.0GB"

    def test_format_duration(self) -> None:
        """Test duration formatting."""
        from aidrive_fuse.utils import format_duration

        assert format_duration(30) == "30.0s"
        assert format_duration(90) == "1.5m"
        assert format_duration(3600) == "1.0h"


if __name__ == "__main__":
    pytest.main([__file__])
