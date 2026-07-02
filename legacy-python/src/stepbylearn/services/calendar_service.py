"""Calendar scheduling: map ordered path steps onto concrete dates.

Scheduling is idempotent — re-running it for a path overwrites existing entries
(keyed by step) rather than duplicating them — so a user can freely reschedule.
All date math is offline and deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from stepbylearn.domain.exceptions import RepositoryError
from stepbylearn.domain.models import CalendarEntry, PathStep
from stepbylearn.repositories.unit_of_work import UnitOfWork


@dataclass(frozen=True, slots=True)
class ScheduleOptions:
    """Parameters controlling how steps are laid out on the calendar.

    Attributes:
        start_date: Date assigned to the first step.
        days_between: Calendar days to advance between consecutive steps.
        skip_weekends: When ``True``, Saturdays and Sundays are skipped.
        milestone_every: Mark every Nth step (1-based) as a milestone; ``0``
            disables automatic milestones.
    """

    start_date: date
    days_between: int = 1
    skip_weekends: bool = False
    milestone_every: int = 0


class CalendarService:
    """Assigns calendar dates to a path's steps."""

    def __init__(self, uow: UnitOfWork) -> None:
        """Initialize the service.

        Args:
            uow: The active unit of work (transaction + repositories).
        """
        self._uow = uow

    def schedule_path(
        self, path_id: str, options: ScheduleOptions
    ) -> list[CalendarEntry]:
        """Schedule every step of a path onto the calendar.

        Args:
            path_id: The path to schedule.
            options: Scheduling parameters.

        Returns:
            The list of created/updated calendar entries, ordered by date.

        Raises:
            RepositoryError: If the path has no steps to schedule.
        """
        steps = self._uow.steps.list_by_path(path_id)
        if not steps:
            raise RepositoryError(f"Path {path_id} has no steps to schedule.")

        entries: list[CalendarEntry] = []
        cursor = self._first_valid_date(options.start_date, options.skip_weekends)
        for position, step in enumerate(steps, start=1):
            entry = self._build_entry(step, path_id, cursor, position, options)
            self._uow.calendar.upsert(entry)
            entries.append(entry)
            cursor = self._advance(cursor, options)

        self._uow.commit()
        return entries

    def _build_entry(
        self,
        step: PathStep,
        path_id: str,
        scheduled: date,
        position: int,
        options: ScheduleOptions,
    ) -> CalendarEntry:
        """Construct a calendar entry for a step at a given date.

        Args:
            step: The step being scheduled.
            path_id: The owning path id (denormalized onto the entry).
            scheduled: The resolved date for this step.
            position: 1-based position used for milestone marking.
            options: Scheduling parameters.

        Returns:
            An unpersisted :class:`CalendarEntry`.
        """
        is_milestone = (
            options.milestone_every > 0 and position % options.milestone_every == 0
        )
        return CalendarEntry(
            step_id=step.id,
            path_id=path_id,
            scheduled_date=scheduled,
            duration_minutes=step.estimated_minutes,
            is_milestone=is_milestone,
        )

    def _advance(self, current: date, options: ScheduleOptions) -> date:
        """Advance the date cursor by the configured cadence.

        Args:
            current: The current cursor date.
            options: Scheduling parameters.

        Returns:
            The next scheduling date, skipping weekends when requested.
        """
        nxt = current + timedelta(days=max(1, options.days_between))
        return self._first_valid_date(nxt, options.skip_weekends)

    @staticmethod
    def _first_valid_date(candidate: date, skip_weekends: bool) -> date:
        """Return ``candidate`` or the next weekday if weekends are skipped.

        Args:
            candidate: The proposed date.
            skip_weekends: Whether weekends are disallowed.

        Returns:
            A valid scheduling date (weekday when ``skip_weekends`` is set).
        """
        if not skip_weekends:
            return candidate
        # weekday(): Monday=0 .. Sunday=6; 5 and 6 are the weekend.
        while candidate.weekday() >= 5:
            candidate += timedelta(days=1)
        return candidate
