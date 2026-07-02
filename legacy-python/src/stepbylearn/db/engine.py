"""SQLite engine and session factory construction.

Two connection-level pragmas are essential for a local-first single-user app:

* ``foreign_keys=ON`` — SQLite disables FK enforcement by default, so cascade
  deletes would silently no-op without this.
* ``journal_mode=WAL`` — the write-ahead log improves concurrency between the
  API's readers and the single writer, and is more crash-resilient.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from stepbylearn.db.orm import Base


def _configure_sqlite_connection(dbapi_connection: object, _record: object) -> None:
    """Apply required pragmas whenever a new DBAPI connection is opened.

    Args:
        dbapi_connection: The raw SQLite DBAPI connection.
        _record: SQLAlchemy connection record (unused).
    """
    cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def build_engine(database_path: str | Path, *, echo: bool = False) -> Engine:
    """Create a SQLAlchemy engine bound to a SQLite file (or ``:memory:``).

    Args:
        database_path: Path to the SQLite file, or ``":memory:"`` for tests.
        echo: When ``True``, log emitted SQL (development only).

    Returns:
        A configured :class:`~sqlalchemy.Engine` with the required pragmas
        registered.
    """
    is_memory = str(database_path) == ":memory:"
    url = "sqlite://" if is_memory else f"sqlite:///{Path(database_path)}"

    # check_same_thread=False: sessions may be dispatched across FastAPI's sync
    # threadpool; we still isolate access per unit of work. For an in-memory DB
    # a StaticPool keeps a single shared connection so every thread sees the same
    # schema and data (otherwise each thread gets its own empty database).
    connect_args = {"check_same_thread": False}
    engine = create_engine(
        url,
        echo=echo,
        future=True,
        connect_args=connect_args,
        poolclass=StaticPool if is_memory else None,
    )
    event.listen(engine, "connect", _configure_sqlite_connection)
    return engine


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Create a session factory bound to the given engine.

    Args:
        engine: The engine sessions should use.

    Returns:
        A configured :class:`~sqlalchemy.orm.sessionmaker`.
    """
    # expire_on_commit=False lets us read attributes after commit without a
    # refresh round-trip, which suits the unit-of-work-per-request pattern.
    return sessionmaker(bind=engine, expire_on_commit=False, class_=Session)


def init_db(engine: Engine) -> None:
    """Create all tables that do not yet exist.

    Intended for tests and first-run bootstrap; production schema evolution is
    handled by Alembic migrations.

    Args:
        engine: The engine whose database should be initialized.
    """
    Base.metadata.create_all(engine)
