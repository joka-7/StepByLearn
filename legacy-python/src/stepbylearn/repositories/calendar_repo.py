"""SQLAlchemy implementation of the calendar repository."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from stepbylearn.db import mappers
from stepbylearn.db.orm import CalendarEntryRow
from stepbylearn.domain.models import CalendarEntry


class CalendarRepository:
    """Read/write access to :class:`CalendarEntry` records in SQLite."""

    def __init__(self, session: Session) -> None:
        """Initialize the repository.

        Args:
            session: The active SQLAlchemy session (owned by the unit of work).
        """
        self._session = session

    def upsert(self, entry: CalendarEntry) -> None:
        """Insert or update the calendar entry for a step (idempotent).

        Re-scheduling a path overwrites existing entries rather than creating
        duplicates, keyed by the unique ``step_id``. Mutable scheduling fields
        are copied onto the existing row when present.

        Args:
            entry: The calendar entry to persist.
        """
        stmt = select(CalendarEntryRow).where(CalendarEntryRow.step_id == entry.step_id)
        existing = self._session.scalars(stmt).one_or_none()
        if existing is None:
            self._session.add(mappers.calendar_to_row(entry))
            return

        existing.scheduled_date = entry.scheduled_date
        existing.start_time = entry.start_time
        existing.duration_minutes = entry.duration_minutes
        existing.is_milestone = entry.is_milestone
        existing.sync_state = entry.sync_state.value
        existing.external_ref = entry.external_ref
        existing.updated_at = entry.updated_at

    def list_by_path(self, path_id: str) -> list[CalendarEntry]:
        """Return all calendar entries for a path, ordered by date.

        Args:
            path_id: The owning path identifier.

        Returns:
            Calendar entries ordered by ``scheduled_date``.
        """
        stmt = (
            select(CalendarEntryRow)
            .where(CalendarEntryRow.path_id == path_id)
            .order_by(CalendarEntryRow.scheduled_date)
        )
        return [mappers.calendar_from_row(row) for row in self._session.scalars(stmt)]

    def list_in_range(self, start: date, end: date) -> list[CalendarEntry]:
        """Return entries scheduled within an inclusive date range.

        Args:
            start: Inclusive lower bound.
            end: Inclusive upper bound.

        Returns:
            Matching calendar entries ordered by ``scheduled_date``.
        """
        stmt = (
            select(CalendarEntryRow)
            .where(CalendarEntryRow.scheduled_date >= start)
            .where(CalendarEntryRow.scheduled_date <= end)
            .order_by(CalendarEntryRow.scheduled_date)
        )
        return [mappers.calendar_from_row(row) for row in self._session.scalars(stmt)]
