"""Abstract repository protocols.

Defining the contracts as :class:`~typing.Protocol` classes (rather than ABCs)
lets the services depend on structural interfaces while the concrete SQLAlchemy
implementations — and any future alternative backends — satisfy them without an
inheritance coupling.
"""

from __future__ import annotations

from datetime import date
from typing import Protocol, runtime_checkable

from stepbylearn.domain.models import (
    AppSettings,
    CalendarEntry,
    LearningPath,
    PathStep,
)


@runtime_checkable
class LearningPathRepositoryProtocol(Protocol):
    """Persistence contract for :class:`LearningPath` aggregates."""

    def add(self, path: LearningPath, *, syllabus_json: str | None = None) -> None:
        """Persist a new path together with its steps."""
        ...

    def get(self, path_id: str) -> LearningPath | None:
        """Return the path (with steps) by id, or ``None`` if absent."""
        ...

    def list_all(self) -> list[LearningPath]:
        """Return all paths, most recently created first."""
        ...

    def delete(self, path_id: str) -> bool:
        """Delete a path (cascading to steps/calendar); return whether it existed."""
        ...


@runtime_checkable
class StepRepositoryProtocol(Protocol):
    """Persistence contract for :class:`PathStep` entities."""

    def get(self, step_id: str) -> PathStep | None:
        """Return a single step by id, or ``None`` if absent."""
        ...

    def list_by_path(self, path_id: str) -> list[PathStep]:
        """Return a path's steps ordered by ``order_index``."""
        ...

    def update(self, step: PathStep) -> None:
        """Persist mutations to an existing step."""
        ...


@runtime_checkable
class CalendarRepositoryProtocol(Protocol):
    """Persistence contract for :class:`CalendarEntry` records."""

    def upsert(self, entry: CalendarEntry) -> None:
        """Insert or replace the calendar entry for a step (idempotent)."""
        ...

    def list_by_path(self, path_id: str) -> list[CalendarEntry]:
        """Return all calendar entries for a path, ordered by date."""
        ...

    def list_in_range(self, start: date, end: date) -> list[CalendarEntry]:
        """Return entries whose ``scheduled_date`` falls within ``[start, end]``."""
        ...


@runtime_checkable
class SettingsRepositoryProtocol(Protocol):
    """Persistence contract for the singleton :class:`AppSettings`."""

    def get(self) -> AppSettings:
        """Return current settings, creating defaults on first access."""
        ...

    def save(self, settings: AppSettings) -> None:
        """Persist updated settings (singleton row)."""
        ...
