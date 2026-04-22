# AI Drive FUSE Release v1.0.17

Generated on: 2025-08-18 15:42:15 UTC

## Package Contents

### Python Packages
- aidrive_fuse-1.0.17-py3-none-any.whl
- aidrive_fuse-1.0.17.tar.gz
- genspark_aidrive_sdk-0.1.1-py3-none-any.whl

### Installation Scripts
- mount-aidrive.sh
- check-environment.sh
- unmount-aidrive.sh
- mount-aidrive-async.sh
- check-libfuse.sh
- install-aidrive-fuse.sh

### Documentation
- README.md - Main documentation
- requirements.txt - Python dependencies
- RELEASE-INFO.md - This file
- scripts-README.md

### Configuration
- aidrive-mount.conf

## Quick Installation

1. Extract the release package
2. Run: `./scripts/install-aidrive-fuse.sh`
3. Mount: `./scripts/mount-aidrive.sh /mnt/aidrive`

## Environment Requirements

The following environment variables must be set in the GenSpark sandbox:
- `GENSPARK_TOKEN` (required)
- `GENSPARK_BASE_URL` (optional)
- `GENSPARK_AIDRIVE_API_PREFIX` (optional)
- `GENSPARK_ROUTE_IDENTIFIER` (optional)
- `GENSPARK_ENVIRONMENT_ID` (optional)

For more information, see README.md and docs/scripts-README.md
