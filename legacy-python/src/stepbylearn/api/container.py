"""Composition root: builds and holds long-lived application dependencies.

Wiring is centralized here so the routes stay thin and the object graph is
constructed exactly once per process. The container is stored on
``app.state`` and exposed to routes via the dependency helpers in
:mod:`stepbylearn.api.deps`.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from stepbylearn.ai.resolver import StrategyResolver
from stepbylearn.config import AppPaths, Settings, resolve_app_paths
from stepbylearn.db import build_engine, build_session_factory, init_db
from stepbylearn.repositories.unit_of_work import SqlAlchemyUnitOfWork
from stepbylearn.security.secret_store import SecretStore


@dataclass(slots=True)
class Container:
    """Holds process-wide singletons and factories.

    Attributes:
        settings: Process configuration.
        paths: Resolved filesystem paths.
        engine: The SQLAlchemy engine.
        session_factory: Factory for per-request sessions.
        secret_store: Cloud key store.
        resolver: AI strategy resolver.
    """

    settings: Settings
    paths: AppPaths
    engine: Engine
    session_factory: sessionmaker[Session]
    secret_store: SecretStore
    resolver: StrategyResolver

    def new_uow(self) -> SqlAlchemyUnitOfWork:
        """Create a fresh unit of work bound to the shared session factory.

        Returns:
            A new :class:`SqlAlchemyUnitOfWork` (used as a context manager).
        """
        return SqlAlchemyUnitOfWork(self.session_factory)


def build_container(settings: Settings) -> Container:
    """Construct the dependency container from process settings.

    Also ensures the database schema exists (first-run bootstrap). In production
    Alembic manages migrations, but ``create_all`` is a safe no-op when the
    tables already exist.

    Args:
        settings: The loaded process settings.

    Returns:
        A fully wired :class:`Container`.
    """
    paths = resolve_app_paths(settings.data_dir)
    engine = build_engine(paths.database_path)
    init_db(engine)
    session_factory = build_session_factory(engine)
    secret_store = SecretStore(paths.data_dir)
    resolver = StrategyResolver(secret_store)
    return Container(
        settings=settings,
        paths=paths,
        engine=engine,
        session_factory=session_factory,
        secret_store=secret_store,
        resolver=resolver,
    )
