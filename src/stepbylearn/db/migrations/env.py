"""Alembic migration environment.

Resolves the SQLite URL from the application's own path resolution (so it honors
``SBL_DATA_DIR``) and targets the ORM metadata for autogeneration.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool

from stepbylearn.config import resolve_app_paths
from stepbylearn.config.settings import get_settings
from stepbylearn.db.engine import build_engine
from stepbylearn.db.orm import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_path() -> str:
    """Resolve the SQLite file path from application settings.

    Returns:
        The absolute path to the SQLite database file.
    """
    settings = get_settings()
    return str(resolve_app_paths(settings.data_dir).database_path)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a live connection)."""
    context.configure(
        url=f"sqlite:///{_database_path()}",
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,  # required for SQLite ALTER operations
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against a live SQLite connection."""
    engine = build_engine(_database_path())
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # batch mode for SQLite-friendly migrations
            poolclass=pool.NullPool,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
