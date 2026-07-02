"""SQLite persistence detail.

This package is an implementation detail of the repository layer. Nothing above
``repositories`` should import from here directly, so the storage engine stays
swappable.
"""

from stepbylearn.db.engine import build_engine, build_session_factory, init_db

__all__ = ["build_engine", "build_session_factory", "init_db"]
