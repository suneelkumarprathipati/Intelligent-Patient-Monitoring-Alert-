"""
Cache Management for AI Drive FUSE

Implements metadata and data caching to improve performance and reduce API calls.
"""

import os
import time
import shutil
import tempfile
import hashlib
import logging
from typing import Any, Dict, List, Optional, Set, Tuple, TYPE_CHECKING
from pathlib import Path
from threading import RLock
from collections import OrderedDict
import json

if TYPE_CHECKING:
    from genspark_aidrive_sdk import AIDriveClient


logger = logging.getLogger(__name__)


class MetadataCache:
    """Cache for file metadata and directory listings."""

    def __init__(self, ttl: int = 300):
        """Initialize metadata cache.

        Args:
            ttl: Time-to-live for cache entries in seconds
        """
        self.ttl = ttl
        self._file_attrs: Dict[str, Tuple[Any, float]] = {}
        self._dir_listings: Dict[str, Tuple[List[str], float]] = {}
        self._lock = RLock()

    def _is_expired(self, timestamp: float) -> bool:
        """Check if cache entry is expired."""
        return (time.time() - timestamp) > self.ttl

    def get_file_attrs(self, path: str) -> Optional[Any]:
        """Get cached file attributes."""
        with self._lock:
            if path in self._file_attrs:
                attrs, timestamp = self._file_attrs[path]
                if not self._is_expired(timestamp):
                    logger.debug(f"Cache hit for file attrs: {path}")
                    return attrs
                else:
                    # Remove expired entry
                    del self._file_attrs[path]
        return None

    def cache_file_attrs(self, path: str, attrs: Any) -> None:
        """Cache file attributes."""
        with self._lock:
            self._file_attrs[path] = (attrs, time.time())
            logger.debug(f"Cached file attrs: {path}")

    def get_dir_listing(self, path: str) -> Optional[List[str]]:
        """Get cached directory listing."""
        with self._lock:
            if path in self._dir_listings:
                listing, timestamp = self._dir_listings[path]
                if not self._is_expired(timestamp):
                    logger.debug(f"Cache hit for dir listing: {path}")
                    return listing
                else:
                    # Remove expired entry
                    del self._dir_listings[path]
        return None

    def cache_dir_listing(self, path: str, entries: List[str]) -> None:
        """Cache directory listing."""
        with self._lock:
            self._dir_listings[path] = (entries, time.time())
            logger.debug(f"Cached dir listing: {path} ({len(entries)} entries)")

    def invalidate(self, path: str) -> None:
        """Invalidate cache entry for specific path."""
        with self._lock:
            if path in self._file_attrs:
                del self._file_attrs[path]
                logger.debug(f"Invalidated file attrs cache: {path}")

    def invalidate_dir_listing(self, path: str) -> None:
        """Invalidate directory listing cache."""
        with self._lock:
            if path in self._dir_listings:
                del self._dir_listings[path]
                logger.debug(f"Invalidated dir listing cache: {path}")

    def cleanup_expired(self) -> None:
        """Clean up expired cache entries."""
        current_time = time.time()

        with self._lock:
            # Clean file attributes
            expired_files = [
                path for path, (_, timestamp) in self._file_attrs.items()
                if (current_time - timestamp) > self.ttl
            ]
            for path in expired_files:
                del self._file_attrs[path]

            # Clean directory listings
            expired_dirs = [
                path for path, (_, timestamp) in self._dir_listings.items()
                if (current_time - timestamp) > self.ttl
            ]
            for path in expired_dirs:
                del self._dir_listings[path]

            if expired_files or expired_dirs:
                logger.debug(f"Cleaned up {len(expired_files)} file attrs, {len(expired_dirs)} dir listings")


class DataCache:
    """Cache for file data with LRU eviction."""

    def __init__(self, cache_dir: str, max_size: int):
        """Initialize data cache.

        Args:
            cache_dir: Directory for cached files
            max_size: Maximum cache size in bytes
        """
        self.cache_dir = Path(cache_dir)
        self.max_size = max_size
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Track cached files with LRU ordering
        self._cached_files: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self._dirty_files: Set[str] = set()
        self._lock = RLock()

        # Load existing cache state
        self._load_cache_state()

    def _get_cache_path(self, remote_path: str) -> Path:
        """Get local cache path for remote file."""
        # Use hash of remote path to avoid filesystem issues
        path_hash = hashlib.sha256(remote_path.encode()).hexdigest()
        return self.cache_dir / f"{path_hash}.cache"

    def _get_metadata_path(self, remote_path: str) -> Path:
        """Get metadata file path for cached file."""
        path_hash = hashlib.sha256(remote_path.encode()).hexdigest()
        return self.cache_dir / f"{path_hash}.meta"

    def _load_cache_state(self) -> None:
        """Load cache state from disk."""
        try:
            for meta_file in self.cache_dir.glob("*.meta"):
                try:
                    with open(meta_file, 'r') as f:
                        metadata = json.load(f)

                    remote_path = metadata['remote_path']
                    cache_path = self._get_cache_path(remote_path)

                    if cache_path.exists():
                        self._cached_files[remote_path] = {
                            'cache_path': cache_path,
                            'size': cache_path.stat().st_size,
                            'cached_time': metadata.get('cached_time', time.time()),
                            'access_time': time.time()
                        }

                        if metadata.get('dirty', False):
                            self._dirty_files.add(remote_path)
                    else:
                        # Remove orphaned metadata
                        meta_file.unlink()
                except Exception as e:
                    logger.warning(f"Failed to load cache metadata {meta_file}: {e}")

            logger.info(f"Loaded {len(self._cached_files)} cached files")
        except Exception as e:
            logger.error(f"Failed to load cache state: {e}")

    def _save_metadata(self, remote_path: str) -> None:
        """Save metadata for cached file."""
        try:
            metadata_path = self._get_metadata_path(remote_path)
            file_info = self._cached_files[remote_path]

            metadata = {
                'remote_path': remote_path,
                'cached_time': file_info['cached_time'],
                'size': file_info['size'],
                'dirty': remote_path in self._dirty_files
            }

            with open(metadata_path, 'w') as f:
                json.dump(metadata, f)
        except Exception as e:
            logger.error(f"Failed to save metadata for {remote_path}: {e}")

    def _update_access_time(self, remote_path: str) -> None:
        """Update access time for LRU tracking."""
        if remote_path in self._cached_files:
            self._cached_files[remote_path]['access_time'] = time.time()
            # Move to end for LRU
            self._cached_files.move_to_end(remote_path)

    def _evict_if_needed(self, required_size: int = 0) -> None:
        """Evict files if cache is too full."""
        current_size = sum(info['size'] for info in self._cached_files.values())

        while (current_size + required_size) > self.max_size and self._cached_files:
            # Find least recently used file that is not dirty
            lru_path = None
            for path in self._cached_files:
                if path not in self._dirty_files:
                    lru_path = path
                    break

            # If no non-dirty files available, break to prevent data loss
            if lru_path is None:
                logger.warning("Cannot evict: all cached files are dirty. "
                               "Consider uploading changes or increasing cache size.")
                break

            # Get file size before eviction for performance optimization
            file_size = self._cached_files[lru_path]['size']
            self._evict_file(lru_path)
            current_size -= file_size  # Incremental update instead of recalculation

    def _evict_file(self, remote_path: str) -> None:
        """Evict specific file from cache."""
        if remote_path not in self._cached_files:
            return

        file_info = self._cached_files[remote_path]
        cache_path = file_info['cache_path']

        try:
            # Remove cached file
            if cache_path.exists():
                cache_path.unlink()

            # Remove metadata
            metadata_path = self._get_metadata_path(remote_path)
            if metadata_path.exists():
                metadata_path.unlink()

            # Remove from tracking
            del self._cached_files[remote_path]
            self._dirty_files.discard(remote_path)

            logger.debug(f"Evicted from cache: {remote_path}")
        except Exception as e:
            logger.error(f"Failed to evict {remote_path}: {e}")

    def get_cached_path(self, remote_path: str) -> Optional[str]:
        """Get local path for cached file."""
        with self._lock:
            if remote_path in self._cached_files:
                self._update_access_time(remote_path)
                cache_path = self._cached_files[remote_path]['cache_path']
                if cache_path.exists():
                    # Update size to reflect current file size
                    actual_size = cache_path.stat().st_size
                    self._cached_files[remote_path]['size'] = actual_size
                    logger.debug(f"Cache hit: {remote_path}")
                    return str(cache_path)
                else:
                    # File missing from cache, remove entry
                    del self._cached_files[remote_path]
        return None

    def download_to_cache(self, remote_path: str, client: "AIDriveClient") -> str:
        """Download file to cache."""
        with self._lock:
            cache_path = self._get_cache_path(remote_path)

            # Check if already cached
            if remote_path in self._cached_files and cache_path.exists():
                self._update_access_time(remote_path)
                return str(cache_path)

            # Download file
            logger.debug(f"Downloading to cache: {remote_path}")

            final_cache_path = None
            try:
                # Use a more secure approach to avoid TOCTOU race condition
                # Create a temporary directory and download file there
                with tempfile.TemporaryDirectory(dir=self.cache_dir) as temp_dir:
                    temp_filename = f"download_{hash(remote_path) & 0x7FFFFFFF}.tmp"
                    temp_path = os.path.join(temp_dir, temp_filename)

                    # Download to temporary file in secure directory
                    client.download_file(remote_path, temp_path)

                    # Get file size
                    file_size = Path(temp_path).stat().st_size

                    # Ensure cache has space
                    self._evict_if_needed(file_size)

                    # Move to final cache location (temp_dir will be cleaned up automatically)
                    shutil.move(temp_path, cache_path)
                    final_cache_path = cache_path

                # Track in cache (only if download was successful)
                if final_cache_path:
                    self._cached_files[remote_path] = {
                        'cache_path': final_cache_path,
                        'size': file_size,
                        'cached_time': time.time(),
                        'access_time': time.time()
                    }

                    # Save metadata
                    self._save_metadata(remote_path)

                    logger.info(f"Downloaded to cache: {remote_path} ({file_size} bytes)")
                    return str(final_cache_path)
                else:
                    # This should not happen, but provide a fallback
                    raise RuntimeError("Download completed but final cache path is not set")

            except Exception as e:
                # Cleanup on error - temporary directory is automatically cleaned up
                # Only need to clean final cache path if it was created
                if final_cache_path and Path(final_cache_path).exists():
                    Path(final_cache_path).unlink()
                raise e

    def create_cached_file(self, remote_path: str) -> str:
        """Create empty cached file for new files."""
        with self._lock:
            cache_path = self._get_cache_path(remote_path)

            # Create empty file
            cache_path.touch()

            # Track in cache
            self._cached_files[remote_path] = {
                'cache_path': cache_path,
                'size': 0,
                'cached_time': time.time(),
                'access_time': time.time()
            }

            # Mark as dirty (needs upload)
            self._dirty_files.add(remote_path)
            self._save_metadata(remote_path)

            logger.debug(f"Created cached file: {remote_path}")
            return str(cache_path)

    def mark_dirty(self, remote_path: str) -> None:
        """Mark cached file as dirty (needs upload)."""
        with self._lock:
            self._dirty_files.add(remote_path)
            if remote_path in self._cached_files:
                # Update file size when marking dirty
                cache_path = self._cached_files[remote_path]['cache_path']
                if cache_path.exists():
                    actual_size = cache_path.stat().st_size
                    self._cached_files[remote_path]['size'] = actual_size
                    logger.debug(f"Updated cached file size: {remote_path} -> {actual_size} bytes")
                self._save_metadata(remote_path)
            logger.debug(f"Marked dirty: {remote_path}")

    def mark_clean(self, remote_path: str) -> None:
        """Mark cached file as clean (uploaded)."""
        with self._lock:
            self._dirty_files.discard(remote_path)
            if remote_path in self._cached_files:
                self._save_metadata(remote_path)
            logger.debug(f"Marked clean: {remote_path}")

    def get_dirty_files(self) -> List[Tuple[str, str]]:
        """Get list of dirty files needing upload."""
        with self._lock:
            dirty_list = []
            for remote_path in self._dirty_files:
                if remote_path in self._cached_files:
                    cache_path = self._cached_files[remote_path]['cache_path']
                    if cache_path.exists():
                        dirty_list.append((str(cache_path), remote_path))
            return dirty_list

    def get_cached_files_in_dir(self, dir_path: str) -> List[str]:
        """Get list of cached files in a directory."""
        with self._lock:
            # Normalize directory path
            dir_path = dir_path.rstrip('/') if dir_path != '/' else '/'

            cached_files = []
            for remote_path in self._cached_files:
                # Check if this file is in the specified directory
                file_dir = '/'.join(remote_path.split('/')[:-1]) or '/'
                if file_dir == dir_path:
                    cache_info = self._cached_files[remote_path]
                    if cache_info['cache_path'].exists():
                        cached_files.append(remote_path)

            return cached_files

    def get_cached_file_size(self, remote_path: str) -> Optional[int]:
        """Get current size of cached file."""
        with self._lock:
            if remote_path in self._cached_files:
                cache_path = self._cached_files[remote_path]['cache_path']
                if cache_path.exists():
                    actual_size = cache_path.stat().st_size
                    # Update our cached size info
                    self._cached_files[remote_path]['size'] = actual_size
                    return int(actual_size)
            return None

    def invalidate(self, remote_path: str) -> None:
        """Remove file from cache."""
        with self._lock:
            if remote_path in self._cached_files:
                self._evict_file(remote_path)

    def cleanup_expired(self) -> None:
        """Clean up old cached files."""
        with self._lock:
            current_time = time.time()
            expired_threshold = 24 * 3600  # 24 hours

            expired_files = [
                path for path, info in self._cached_files.items()
                if (current_time - info['access_time']) > expired_threshold
                and path not in self._dirty_files  # Don't remove dirty files
            ]

            for path in expired_files:
                self._evict_file(path)

            if expired_files:
                logger.info(f"Cleaned up {len(expired_files)} expired cache files")

    def cleanup(self) -> None:
        """Full cleanup on shutdown."""
        logger.info("Cleaning up data cache")

        # Upload any remaining dirty files (best effort)
        dirty_count = len(self._dirty_files)
        if dirty_count > 0:
            logger.warning(f"Shutting down with {dirty_count} dirty files - data may be lost")

        # Optional: Could implement emergency sync here

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_size = sum(info['size'] for info in self._cached_files.values())
            return {
                'cached_files': len(self._cached_files),
                'dirty_files': len(self._dirty_files),
                'total_size': total_size,
                'max_size': self.max_size,
                'usage_percentage': (total_size / self.max_size) * 100 if self.max_size > 0 else 0
            }
