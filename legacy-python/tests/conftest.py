"""Shared pytest fixtures: in-memory database, fakes, and a wired container."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from stepbylearn.ai.base import AIStrategy
from stepbylearn.ai.resolver import StrategyResolver
from stepbylearn.api.container import Container
from stepbylearn.config import Settings, resolve_app_paths
from stepbylearn.db import build_engine, build_session_factory, init_db
from stepbylearn.domain.enums import AIProvider
from stepbylearn.repositories.unit_of_work import SqlAlchemyUnitOfWork
from stepbylearn.security.secret_store import SecretStore


class FakeStrategy(AIStrategy):
    """Deterministic AI strategy returning canned output for tests."""

    def __init__(self, response: str, *, healthy: bool = True) -> None:
        self._response = response
        self._healthy = healthy
        self.calls: list[str] = []

    @property
    def provider(self) -> AIProvider:
        return AIProvider.LOCAL_OLLAMA

    @property
    def model_name(self) -> str:
        return "fake-model"

    async def health_check(self) -> bool:
        return self._healthy

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        self.calls.append(prompt)
        return self._response


@pytest.fixture
def engine() -> Iterator[Engine]:
    """Provide a fresh in-memory SQLite engine with the schema created."""
    eng = build_engine(":memory:")
    init_db(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    """Provide a session factory bound to the in-memory engine."""
    return build_session_factory(engine)


@pytest.fixture
def make_uow(session_factory: sessionmaker[Session]):
    """Return a callable that opens a new unit of work."""
    return lambda: SqlAlchemyUnitOfWork(session_factory)


@pytest.fixture
def secret_store(tmp_path: Path) -> SecretStore:
    """Provide a SecretStore using a temp data dir (fallback encryption)."""
    return SecretStore(tmp_path)


@pytest.fixture
def container(
    tmp_path: Path,
    engine: Engine,
    session_factory: sessionmaker[Session],
    secret_store: SecretStore,
) -> Container:
    """Provide a fully wired container over the in-memory database."""
    settings = Settings(data_dir=str(tmp_path))
    return Container(
        settings=settings,
        paths=resolve_app_paths(str(tmp_path)),
        engine=engine,
        session_factory=session_factory,
        secret_store=secret_store,
        resolver=StrategyResolver(secret_store),
    )


VALID_SYLLABUS_JSON = """
{
  "title": "Learn X",
  "topic": "X",
  "description": "A path.",
  "difficulty": "beginner",
  "estimated_hours": 3,
  "steps": [
    {"title": "Step 1", "content": "Intro", "estimated_minutes": 30},
    {"title": "Step 2", "content": "Deep dive", "estimated_minutes": 45}
  ]
}
"""
