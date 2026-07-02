"""Resolve OS-appropriate filesystem locations for local-first storage.

StepByLearn keeps *all* user data on the client machine. This module centralizes
where that data lives so the rest of the codebase never hard-codes a path. The
resolution follows platform conventions (XDG on Linux, ``Application Support`` on
macOS, ``%LOCALAPPDATA%`` on Windows) with an ``SBL_DATA_DIR`` override.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

_APP_DIR_NAME = "stepbylearn"


@dataclass(frozen=True, slots=True)
class AppPaths:
    """Immutable bundle of resolved application filesystem paths.

    Attributes:
        data_dir: Root directory holding all local user data.
        database_path: Full path to the SQLite database file.
    """

    data_dir: Path
    database_path: Path


def _platform_data_root() -> Path:
    """Return the OS-appropriate base directory for per-user application data.

    Returns:
        The platform-conventional data root (already namespaced is *not*
        applied here; the caller appends the app directory name).
    """
    if sys.platform == "win32":
        # Prefer LOCALAPPDATA (non-roaming) so a large SQLite file is not synced.
        base = os.environ.get("LOCALAPPDATA")
        if base:
            return Path(base)
        return Path.home() / "AppData" / "Local"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    # Linux / other POSIX: honor the XDG Base Directory specification.
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg)
    return Path.home() / ".local" / "share"


def resolve_app_paths(data_dir_override: str | Path | None = None) -> AppPaths:
    """Resolve and materialize the application data directory.

    The directory is created if it does not yet exist so downstream code can
    assume the location is writable.

    Args:
        data_dir_override: Explicit data directory. When ``None``, the value of
            the ``SBL_DATA_DIR`` environment variable is used, falling back to
            the platform-conventional location.

    Returns:
        An :class:`AppPaths` describing where local data is stored.
    """
    if data_dir_override is not None:
        data_dir = Path(data_dir_override).expanduser()
    elif env_dir := os.environ.get("SBL_DATA_DIR"):
        data_dir = Path(env_dir).expanduser()
    else:
        data_dir = _platform_data_root() / _APP_DIR_NAME

    data_dir.mkdir(parents=True, exist_ok=True)
    return AppPaths(data_dir=data_dir, database_path=data_dir / "stepbylearn.sqlite3")
