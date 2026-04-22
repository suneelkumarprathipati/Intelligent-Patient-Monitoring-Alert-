"""
AI Drive FUSE Driver Implementation

Main FUSE filesystem driver that translates POSIX operations to AI Drive API calls.
"""

import os
import time
import stat
import errno
import logging
import asyncio
from typing import Dict, Any, List, Optional
from threading import Thread, Lock
import threading
from pathlib import Path
from fuse import FUSE, FuseOSError, Operations  # type: ignore[import-not-found]

# Import AI Drive SDK (will be available in VM environment)
try:
    from genspark_aidrive_sdk import (
        AIDriveClient,
        AuthenticationError,
        RemoteNotFoundError
    )
except ImportError:
    # Mock for development/testing
    from typing import NamedTuple

    class MockFileItem(NamedTuple):
        name: str
        path: str
        type: str
        size: int
        modified_time: int

    class MockListResponse(NamedTuple):
        items: List[MockFileItem]

    class AIDriveClient:  # type: ignore
        def __init__(self) -> None:
            pass

        def list_files(self, path: str, limit: Optional[int] = None) -> MockListResponse:
            # Return empty list for mock
            return MockListResponse(items=[])

        def upload_file(self, local: str, remote: str) -> None:
            pass

        def download_file(self, remote: str, local: str) -> None:
            pass

        def create_directory(self, path: str) -> None:
            pass

        def delete_item(self, path: str) -> None:
            pass

        def move_item(self, src: str, dst: str) -> None:
            pass

        def get_storage_usage(self) -> Dict[str, Any]:
            return {}

    class AuthenticationError(Exception):  # type: ignore
        pass

    class RemoteNotFoundError(Exception):  # type: ignore
        pass

from .cache_manager import MetadataCache, DataCache
from .operation_queue import OperationQueue
from .config import Config


logger = logging.getLogger(__name__)


class FileAttrs:
    """File attributes for FUSE operations."""

    def __init__(self, name: str, path: str, file_type: str, size: int,
                 modified_time: int, is_directory: bool = False):
        self.name = name
        self.path = path
        self.type = file_type
        self.size = size
        self.modified_time = modified_time
        self.is_directory = is_directory
        self.is_file = not is_directory

    def to_stat(self) -> Dict[str, Any]:
        """Convert to stat dictionary for FUSE."""
        mode = stat.S_IFDIR | 0o755 if self.is_directory else stat.S_IFREG | 0o644

        return {
            'st_mode': mode,
            'st_ino': hash(self.path) & 0x7FFFFFFF,  # Generate inode from path hash
            'st_dev': 0,
            'st_nlink': 2 if self.is_directory else 1,
            'st_uid': os.getuid(),
            'st_gid': os.getgid(),
            'st_size': self.size,
            'st_atime': self.modified_time,
            'st_mtime': self.modified_time,
            'st_ctime': self.modified_time,
        }


class AIDriveFUSE(Operations):  # type: ignore[misc,no-any-unimported]
    """AI Drive FUSE filesystem implementation."""

    def __init__(self, config: Config):
        self.config = config
        self.client: Optional[AIDriveClient] = None
        self.metadata_cache = MetadataCache(ttl=config.cache_ttl)
        self.data_cache = DataCache(
            cache_dir=config.cache_location,
            max_size=config.cache_size
        )
        self.operation_queue = OperationQueue(
            max_concurrent_uploads=config.max_concurrent_uploads,
            max_concurrent_downloads=config.max_concurrent_downloads
        )

        # File descriptor tracking
        self._fd_counter = 0
        self._fd_lock = Lock()
        self._open_files: Dict[int, Dict[str, Any]] = {}

        # Background thread for async operations
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._background_thread: Optional[Thread] = None
        self._shutdown_event: Optional[asyncio.Event] = None  # Will be created in background thread
        self._shutdown_flag = threading.Event()  # Thread-safe shutdown signal

        self._init_client()
        self._start_background_thread()

    def _init_client(self) -> None:
        """Initialize AI Drive client."""
        try:
            self.client = AIDriveClient()
            logger.info("AI Drive client initialized successfully")
        except AuthenticationError as e:
            logger.error(f"Authentication failed: {e}")
            raise FuseOSError(errno.EACCES)
        except Exception as e:
            logger.error(f"Failed to initialize AI Drive client: {e}")
            raise FuseOSError(errno.EIO)

    def _start_background_thread(self) -> None:
        """Start background thread for async operations."""
        def run_background() -> None:
            logger.info("Starting background thread for async operations")
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)

            # Create shutdown event in the correct event loop context
            self._shutdown_event = asyncio.Event()

            try:
                logger.info("Background event loop starting")
                self._loop.run_until_complete(self._background_worker())
            except Exception as e:
                logger.error(f"Background thread error: {e}")
                import traceback
                logger.error(f"Background thread traceback: {traceback.format_exc()}")
            finally:
                logger.info("Background thread cleanup")
                self._loop.close()

        self._background_thread = Thread(target=run_background, daemon=True)
        self._background_thread.start()
        logger.info("Background thread started")

    async def _background_worker(self) -> None:
        """Background worker for async operations."""
        logger.info(f"Background worker started, auto_sync_interval={self.config.auto_sync_interval}s")

        iteration = 0
        while not self._shutdown_flag.is_set():
            try:
                iteration += 1
                logger.debug(f"Background worker iteration {iteration}")

                # Check shutdown event (asyncio)
                if self._shutdown_event and self._shutdown_event.is_set():
                    break

                # Process pending operations
                logger.debug("Processing pending operations...")
                await self.operation_queue.process_pending()

                # Auto-sync dirty files
                logger.debug("Auto-syncing dirty files...")
                await self._auto_sync_dirty_files()

                # Cache cleanup
                logger.debug("Cleaning up cache...")
                self.data_cache.cleanup_expired()

                logger.debug(f"Background worker sleeping for {self.config.auto_sync_interval}s")

                # Wait for shutdown event or timeout
                try:
                    if self._shutdown_event:
                        await asyncio.wait_for(
                            self._shutdown_event.wait(),  # Wait for shutdown event
                            timeout=self.config.auto_sync_interval
                        )
                        # If we reach here, shutdown was requested
                        break
                    else:
                        await asyncio.sleep(self.config.auto_sync_interval)
                except asyncio.TimeoutError:
                    pass  # This is expected - continue the loop

            except Exception as e:
                logger.error(f"Background worker error: {e}")
                import traceback
                logger.error(f"Background worker traceback: {traceback.format_exc()}")
                await asyncio.sleep(5)  # Error backoff

        logger.info("Background worker shutting down")

    async def _auto_sync_dirty_files(self) -> None:
        """Sync dirty cached files to remote."""
        dirty_files = self.data_cache.get_dirty_files()
        for local_path, remote_path in dirty_files:
            try:
                await self.operation_queue.queue_upload(local_path, remote_path)
                self.data_cache.mark_clean(remote_path)
                logger.debug(f"Auto-synced dirty file: {remote_path}")
            except Exception as e:
                logger.error(f"Failed to auto-sync {remote_path}: {e}")

    def _get_next_fd(self) -> int:
        """Get next file descriptor."""
        with self._fd_lock:
            self._fd_counter += 1
            return self._fd_counter

    def _normalize_path(self, path: str) -> str:
        """Normalize path for AI Drive API."""
        if not path.startswith('/'):
            path = '/' + path
        return path.rstrip('/') if path != '/' else '/'

    def _is_read_only_operation(self, flags: int) -> bool:
        """Check if file operation is read-only and should not trigger uploads."""
        # Check for read-only flags using proper access mode mask
        if (flags & os.O_ACCMODE) == os.O_RDONLY:
            return True

        # Check if it's a write operation (O_WRONLY or O_RDWR)
        if flags & (os.O_WRONLY | os.O_RDWR):
            return False

        # Default to read-only if no clear write flags
        return True

    # FUSE Operations Implementation

    def getattr(self, path: str, fh: Optional[int] = None) -> Dict[str, Any]:
        """Get file attributes."""
        path = self._normalize_path(path)
        logger.debug(f"getattr: {path}")

        # Root directory special case
        if path == '/':
            attrs = FileAttrs('/', '/', 'directory', 0, int(time.time()), is_directory=True)
            self.metadata_cache.cache_file_attrs(path, attrs)
            return attrs.to_stat()

        # PRIORITY 1: Check if this is a file in cache (local changes take precedence)
        cached_path = self.data_cache.get_cached_path(path)
        if cached_path and os.path.exists(cached_path):
            try:
                # Always get the most current file size from disk
                actual_size = os.path.getsize(cached_path)
                stat_info = os.stat(cached_path)

                # Update cache manager with current size
                self.data_cache.get_cached_file_size(path)  # This updates internal cache

                attrs = FileAttrs(
                    os.path.basename(path), path, 'file',
                    actual_size, int(stat_info.st_mtime),
                    is_directory=False
                )
                # Force refresh metadata cache with latest info
                self.metadata_cache.cache_file_attrs(path, attrs)
                logger.debug(f"Cached file attrs (from disk): {path} (size: {actual_size} bytes)")
                return attrs.to_stat()
            except OSError as e:
                logger.error(f"Error getting cached file attrs for {path}: {e}")
                pass

        # PRIORITY 2: Check metadata cache for remote files
        cached_attrs = self.metadata_cache.get_file_attrs(path)
        if cached_attrs is not None:
            logger.debug(f"Using cached metadata: {path} (size: {cached_attrs.size} bytes)")
            return cached_attrs.to_stat()  # type: ignore

        try:
            # Try to get parent directory listing to find this file
            parent_path = '/'.join(path.split('/')[:-1]) or '/'
            filename = path.split('/')[-1]

            if not self.client:
                raise FuseOSError(errno.EIO)
            response = self.client.list_files(parent_path)
            if response and response.items:
                for item in response.items:
                    if item.name == filename:
                        attrs = FileAttrs(
                            item.name, item.path, item.type,
                            item.size, item.modified_time,
                            is_directory=(item.type == 'directory')
                        )
                        self.metadata_cache.cache_file_attrs(path, attrs)
                        return attrs.to_stat()

            # File not found
            raise FuseOSError(errno.ENOENT)

        except RemoteNotFoundError:
            raise FuseOSError(errno.ENOENT)
        except FuseOSError:
            # Re-raise FUSE errors as-is (including ENOENT)
            raise
        except Exception as e:
            logger.error(f"getattr error for {path}: {e}")
            raise FuseOSError(errno.EIO)

    def readdir(self, path: str, fh: int) -> List[str]:
        """List directory contents."""
        path = self._normalize_path(path)
        logger.debug(f"readdir: {path}")

        entries = set()

        # First, get entries from remote
        try:
            if self.client:
                response = self.client.list_files(path)
                if response and response.items:
                    for item in response.items:
                        entries.add(item.name)
                        # Cache individual file attributes
                        attrs = FileAttrs(
                            item.name, item.path, item.type,
                            item.size, item.modified_time,
                            is_directory=(item.type == 'directory')
                        )
                        self.metadata_cache.cache_file_attrs(item.path, attrs)
        except RemoteNotFoundError:
            pass  # Directory might not exist remotely yet
        except Exception as e:
            logger.error(f"readdir remote error for {path}: {e}")

        # Add newly created cached files that haven't been uploaded yet
        try:
            cached_files = self.data_cache.get_cached_files_in_dir(path)
            for cached_file in cached_files:
                filename = os.path.basename(cached_file)
                entries.add(filename)
        except Exception as e:
            logger.debug(f"readdir cache error for {path}: {e}")

        # Cache directory listing
        entries_list = sorted(list(entries))
        self.metadata_cache.cache_dir_listing(path, entries_list)

        return ['.', '..'] + entries_list

    def mkdir(self, path: str, mode: int) -> None:
        """Create directory."""
        path = self._normalize_path(path)
        logger.debug(f"mkdir: {path}")

        try:
            if not self.client:
                raise FuseOSError(errno.EIO)
            self.client.create_directory(path)

            # Invalidate parent directory cache
            parent_path = '/'.join(path.split('/')[:-1]) or '/'
            self.metadata_cache.invalidate_dir_listing(parent_path)

            logger.info(f"Created directory: {path}")

        except Exception as e:
            logger.error(f"mkdir error for {path}: {e}")
            raise FuseOSError(errno.EIO)

    def rmdir(self, path: str) -> None:
        """Remove directory."""
        path = self._normalize_path(path)
        logger.debug(f"rmdir: {path}")

        try:
            if not self.client:
                raise FuseOSError(errno.EIO)
            self.client.delete_item(path)

            # Invalidate caches
            parent_path = '/'.join(path.split('/')[:-1]) or '/'
            self.metadata_cache.invalidate_dir_listing(parent_path)
            self.metadata_cache.invalidate(path)

            logger.info(f"Removed directory: {path}")

        except RemoteNotFoundError:
            raise FuseOSError(errno.ENOENT)
        except Exception as e:
            logger.error(f"rmdir error for {path}: {e}")
            raise FuseOSError(errno.EIO)

    def unlink(self, path: str) -> None:
        """Delete file."""
        path = self._normalize_path(path)
        logger.debug(f"unlink: {path}")

        try:
            if not self.client:
                raise FuseOSError(errno.EIO)
            self.client.delete_item(path)

            # Invalidate caches
            parent_path = '/'.join(path.split('/')[:-1]) or '/'
            self.metadata_cache.invalidate_dir_listing(parent_path)
            self.metadata_cache.invalidate(path)
            self.data_cache.invalidate(path)

            logger.info(f"Deleted file: {path}")

        except RemoteNotFoundError:
            raise FuseOSError(errno.ENOENT)
        except Exception as e:
            logger.error(f"unlink error for {path}: {e}")
            raise FuseOSError(errno.EIO)

    def rename(self, old: str, new: str) -> None:
        """Rename/move file or directory."""
        old = self._normalize_path(old)
        new = self._normalize_path(new)
        logger.debug(f"rename: {old} -> {new}")

        try:
            if not self.client:
                raise FuseOSError(errno.EIO)
            self.client.move_item(old, new)

            # Invalidate caches for both old and new paths
            old_parent = '/'.join(old.split('/')[:-1]) or '/'
            new_parent = '/'.join(new.split('/')[:-1]) or '/'

            self.metadata_cache.invalidate_dir_listing(old_parent)
            self.metadata_cache.invalidate_dir_listing(new_parent)
            self.metadata_cache.invalidate(old)
            self.data_cache.invalidate(old)

            logger.info(f"Renamed: {old} -> {new}")

        except RemoteNotFoundError:
            raise FuseOSError(errno.ENOENT)
        except Exception as e:
            logger.error(f"rename error {old} -> {new}: {e}")
            raise FuseOSError(errno.EIO)

    def open(self, path: str, flags: int) -> int:
        """Open file."""
        path = self._normalize_path(path)
        logger.debug(f"open: {path}, flags: {flags}")

        # Generate file descriptor
        fd = self._get_next_fd()

        # Check if file exists in cache
        cached_path = self.data_cache.get_cached_path(path)
        if not cached_path:
            # Download file to cache
            try:
                if not self.client:
                    raise FuseOSError(errno.EIO)
                cached_path = self.data_cache.download_to_cache(path, self.client)
            except RemoteNotFoundError:
                if flags & os.O_CREAT:
                    # Create new file in cache
                    cached_path = self.data_cache.create_cached_file(path)
                else:
                    raise FuseOSError(errno.ENOENT)
            except Exception as e:
                logger.error(f"Failed to download {path} to cache: {e}")
                raise FuseOSError(errno.EIO)

        # Track open file
        self._open_files[fd] = {
            'path': path,
            'cached_path': cached_path,
            'flags': flags,
            'modified': False
        }

        return fd

    def read(self, path: str, size: int, offset: int, fh: int) -> bytes:
        """Read file data."""
        logger.debug(f"read: {path}, size: {size}, offset: {offset}, fh: {fh}")

        if fh not in self._open_files:
            raise FuseOSError(errno.EBADF)

        cached_path = self._open_files[fh]['cached_path']

        try:
            with open(cached_path, 'rb') as f:
                f.seek(offset)
                return f.read(size)
        except IOError as e:
            logger.error(f"Read error for {path}: {e}")
            raise FuseOSError(errno.EIO)

    def write(self, path: str, data: bytes, offset: int, fh: int) -> int:
        """Write file data."""
        logger.debug(f"write: {path}, len: {len(data)}, offset: {offset}, fh: {fh}")

        if fh not in self._open_files:
            raise FuseOSError(errno.EBADF)

        cached_path = self._open_files[fh]['cached_path']
        file_flags = self._open_files[fh]['flags']

        try:
            # Ensure file exists
            if not os.path.exists(cached_path):
                # Create empty file if it doesn't exist
                with open(cached_path, 'wb') as f:
                    pass

            # Handle append mode specially
            if file_flags & os.O_APPEND:
                # For append mode, always write at end of file
                with open(cached_path, 'ab') as f:
                    bytes_written = f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                logger.debug(f"Appended {bytes_written} bytes to {path}")
            else:
                # Normal write with specific offset
                with open(cached_path, 'r+b') as f:
                    f.seek(offset)
                    bytes_written = f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                logger.debug(f"Wrote {bytes_written} bytes to {path} at offset {offset}")

            # Mark file as modified and reset sync status since new data was written
            self._open_files[fh]['modified'] = True
            self._open_files[fh]['synced_via_fsync'] = False  # Reset sync flag for new writes
            self.data_cache.mark_dirty(path)

            # Force update of cached file size
            actual_size = os.path.getsize(cached_path)
            logger.debug(f"Updated file size for {path}: {actual_size} bytes")

            return bytes_written
        except IOError as e:
            logger.error(f"Write error for {path}: {e}")
            raise FuseOSError(errno.EIO)

    def flush(self, path: str, fh: int) -> None:
        """Flush file data with upload deduplication."""
        logger.info(f"[FLUSH_DEBUG] flush called: {path}, fh: {fh}")

        if fh not in self._open_files:
            logger.debug(f"flush: file handle {fh} not in open files")
            return

        file_info = self._open_files[fh]
        flags = file_info.get('flags', 0)

        # Skip flush for read-only file handles to prevent unnecessary uploads
        if self._is_read_only_operation(flags):
            logger.info(f"[FLUSH_DEBUG] Skipping flush for read-only handle: {path} (flags: {flags:#x})")
            return

        logger.info(
            f"flush: {path}, modified: {file_info.get('modified', False)}, "
            f"flags: {flags:#x}, loop available: {self._loop is not None}"
        )

        # Only upload if file was actually modified
        if not file_info.get('modified', False):
            logger.debug(f"flush: {path} not modified, no upload needed")
            return

        if file_info['modified']:

            # Use synchronous upload for immediate data safety
            if self._loop:
                # Preemptively mark as clean to prevent race condition with background sync
                # This prevents the background worker from queuing an upload while we're doing sync upload
                self.data_cache.mark_clean(path)
                logger.debug(f"Pre-marked clean to prevent background upload race: {path}")

                logger.info(f"Starting synchronous upload for flush: {path}")
                try:
                    # Calculate timeout based on file size
                    file_size = Path(file_info['cached_path']).stat().st_size
                    upload_timeout = self.config.calculate_upload_timeout(file_size)
                    future_timeout = upload_timeout + 5.0  # Slightly longer timeout for future.result()

                    logger.debug(f"Upload timeout calculated: {upload_timeout}s for {file_size} bytes")

                    future = asyncio.run_coroutine_threadsafe(
                        self.operation_queue.upload_file_sync(
                            file_info['cached_path'],
                            path,
                            timeout=upload_timeout
                        ),
                        self._loop
                    )
                    success = future.result(timeout=future_timeout)
                    if success:
                        logger.info(f"Synchronous upload completed in flush: {path}")
                        # Mark file as no longer modified since it's uploaded
                        file_info['modified'] = False
                        logger.info(f"[FLUSH_DEBUG] *** UPLOAD SUCCESSFUL *** for {path}")

                        # Mark data cache as clean to prevent background re-upload
                        self.data_cache.mark_clean(path)
                        logger.debug(f"Marked data cache clean to prevent double upload: {path}")

                        # Update metadata cache to prevent future cache misses that cause double uploads
                        # This ensures subsequent getattr() calls find the file and don't trigger redundant uploads
                        try:
                            file_stat = Path(file_info['cached_path']).stat()
                            attrs = FileAttrs(
                                os.path.basename(path), path, 'file',
                                file_stat.st_size, int(file_stat.st_mtime),
                                is_directory=False
                            )
                            self.metadata_cache.cache_file_attrs(path, attrs)
                            logger.debug(f"Updated metadata cache after successful upload: {path} (size: {file_stat.st_size} bytes)")  # noqa: 501
                        except Exception as cache_error:
                            # Don't fail the upload if cache update fails
                            logger.warning(f"Failed to update metadata cache after upload for {path}: {cache_error}")
                    else:
                        logger.error(f"Synchronous upload failed in flush: {path}")
                        # Don't raise exception - would break file operations
                except Exception as e:
                    logger.error(f"Synchronous upload exception in flush for {path}: {e}")
                    # Don't raise exception - would break file operations
            else:
                logger.error(f"flush: Cannot perform synchronous upload, no event loop available for {path}")
                # Fall back to queued upload - mark as dirty for background processing
                self.data_cache.mark_dirty(path)

    def release(self, path: str, fh: int) -> None:
        """Release file without any flush operations.

        CRITICAL: This method completely avoids calling flush() to prevent
        sandbox recycling issues. All uploads should be handled by fsync()
        which is called by cp command during normal file operations.

        Rationale:
        - cp command calls fsync() which handles synchronous upload
        - release() flush is redundant and causes problems during sandbox recycling
        - Better to rely on explicit fsync() for data safety rather than implicit release() flush
        - Sandbox recycling triggers release() on all open files, causing unwanted upload attempts
        - Complete prevention is more reliable than conditional logic
        """
        logger.debug(f"release: {path}, fh: {fh}")

        if fh in self._open_files:
            file_info = self._open_files[fh]
            is_modified = file_info.get('modified', False)
            is_synced = file_info.get('synced_via_fsync', False)

            logger.info(f"release: {path}, modified: {is_modified}, synced_via_fsync: {is_synced} - NO FLUSH CALLED")

            # CRITICAL CHANGE: Complete removal of flush() call in release()
            # This prevents sandbox recycling from triggering unwanted uploads
            # All data safety is handled by explicit fsync() calls from cp command
            logger.debug(f"release: {path} - flush completely disabled to prevent sandbox recycling issues")

            # Clean up file descriptor tracking
            del self._open_files[fh]
            logger.debug(f"release: cleaned up file descriptor {fh} for {path}")
        else:
            logger.debug(f"release: {path}, fh: {fh} - file handle not found in open files")

    def fsync(self, path: str, datasync: bool, fh: int) -> None:
        """Synchronize file data."""
        logger.debug(f"[FSYNC_DEBUG] fsync called: {path}, fh: {fh}")

        # Since flush is now synchronous, fsync just needs to call flush
        # The upload will be completed when flush returns
        self.flush(path, fh)

        # Mark file as synced via fsync to prevent redundant flush in release()
        if fh in self._open_files:
            self._open_files[fh]['synced_via_fsync'] = True
            logger.debug(f"fsync: marked {path} as synced via fsync")

        logger.debug(f"fsync completed for: {path} (flush handles synchronous upload)")

    def create(self, path: str, mode: int, fi: Optional[Any] = None) -> int:
        """Create new file."""
        path = self._normalize_path(path)
        logger.debug(f"create: {path}, mode: {mode}")

        # Create empty file in cache
        cached_path = self.data_cache.create_cached_file(path)

        # Generate file descriptor
        fd = self._get_next_fd()
        self._open_files[fd] = {
            'path': path,
            'cached_path': cached_path,
            'flags': os.O_WRONLY | os.O_CREAT,
            'modified': True
        }

        # Mark as dirty for upload
        self.data_cache.mark_dirty(path)

        return fd

    def truncate(self, path: str, length: int, fh: Optional[int] = None) -> None:
        """Truncate file."""
        path = self._normalize_path(path)
        logger.debug(f"truncate: {path}, length: {length}")

        if fh and fh in self._open_files:
            cached_path = self._open_files[fh]['cached_path']
        else:
            cached_path = self.data_cache.get_cached_path(path)
            if not cached_path:
                raise FuseOSError(errno.ENOENT)

        try:
            with open(cached_path, 'r+b') as f:
                f.truncate(length)

            # Mark as modified and reset sync status since file was truncated
            if fh and fh in self._open_files:
                self._open_files[fh]['modified'] = True
                self._open_files[fh]['synced_via_fsync'] = False  # Reset sync flag for truncation
            self.data_cache.mark_dirty(path)

        except IOError as e:
            logger.error(f"Truncate error for {path}: {e}")
            raise FuseOSError(errno.EIO)

    def destroy(self, path: str) -> None:
        """Cleanup on unmount."""
        logger.info("Filesystem unmounting, cleaning up...")

        # Signal background thread to stop using thread-safe mechanism
        self._shutdown_flag.set()

        # Also try to set asyncio event if available
        if self._loop and self._shutdown_event:
            try:
                # Schedule setting the event in the background loop
                if not self._loop.is_closed():
                    self._loop.call_soon_threadsafe(self._shutdown_event.set)
            except Exception as e:
                logger.error(f"Error setting shutdown event: {e}")

        # Wait for background thread
        if self._background_thread:
            self._background_thread.join(timeout=10)
            if self._background_thread.is_alive():
                logger.warning("Background thread did not shut down gracefully")

        # Cleanup caches
        try:
            self.data_cache.cleanup()
        except Exception as e:
            logger.error(f"Error during cache cleanup: {e}")

        logger.info("Filesystem cleanup completed")


def mount_aidrive(mountpoint: str, config: Config) -> None:
    """Mount AI Drive filesystem."""
    logger.info(f"Mounting AI Drive at {mountpoint}")

    # Ensure mount point exists
    Path(mountpoint).mkdir(parents=True, exist_ok=True)

    # Create and start FUSE
    fuse_ops = AIDriveFUSE(config)

    FUSE(
        fuse_ops,
        mountpoint,
        nothreads=False,
        foreground=config.foreground,
        debug=config.debug,
        allow_other=config.allow_other
    )
