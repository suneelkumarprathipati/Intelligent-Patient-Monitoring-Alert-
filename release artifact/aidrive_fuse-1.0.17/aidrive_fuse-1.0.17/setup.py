#!/usr/bin/env python3
"""
Setup script for AI Drive FUSE
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README for long description
readme_path = Path(__file__).parent / "README.md"
if readme_path.exists():
    with open(readme_path, 'r', encoding='utf-8') as f:
        long_description = f.read()
else:
    long_description = "AI Drive FUSE filesystem implementation"

setup(
    name="aidrive-fuse",
    version="v1.0.17",
    description="FUSE filesystem for GenSpark AI Drive",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="GenSpark",
    author_email="support@genspark.com",
    url="https://github.com/genspark/aidrive-fuse",

    packages=find_packages(),

    install_requires=[
        "fusepy>=3.0.1",
        "psutil>=5.8.0",
        "genspark-aidrive-sdk>=0.1.0",  # Updated for local testing
    ],

    extras_require={
        "dev": [
            "pytest>=6.0.0",
            "pytest-asyncio>=0.18.0",
            "pytest-cov>=3.0.0",
            "black>=22.0.0",
            "flake8>=4.0.0",
            "mypy>=0.950",
        ]
    },

    python_requires=">=3.8",

    scripts=[
        "bin/aidrive-mount",
    ],

    data_files=[
        ("/etc", ["etc/aidrive-mount.conf"]),
        ("/lib/systemd/system", ["systemd/aidrive-mount@.service"]),
    ],

    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: System Administrators",
        "License :: OSI Approved :: MIT License",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: System :: Filesystems",
        "Topic :: Utilities",
    ],

    keywords="fuse filesystem aidrive genspark mount",

    entry_points={
        "console_scripts": [
            "aidrive-mount=aidrive_fuse.cli:main",
        ],
    },
)
