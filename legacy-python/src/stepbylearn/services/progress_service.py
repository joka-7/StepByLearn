"""Offline progression tracking: mark steps done and compute completion stats.

Every operation here touches only the local database — no network is ever
required — so progress can be updated and summarized on a plane. Streaks and
percentages are derived client-side from the stored ``done_at`` timestamps.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from stepbylearn.domain.enums import StepStatus
from stepbylearn.domain.exceptions import RepositoryError
from stepbylearn.domain.models import PathStep
from stepbylearn.repositories.unit_of_work import UnitOfWork


@dataclass(frozen=True, slots=True)
class ProgressSummary:
    """Computed progression snapshot for a single path.

    Attributes:
        path_id: The path this summary describes.
        total_steps: Total number of steps in the path.
        done_steps: Number of steps marked done.
        percent_complete: Completion as a 0–100 float.
        next_step_id: The next not-yet-done step id, or ``None`` if finished.
        streak_days: Consecutive days (ending today) with at least one completion.
    """

    path_id: str
    total_steps: int
    done_steps: int
    percent_complete: float
    next_step_id: str | None
    streak_days: int


class ProgressService:
    """Manages step completion state and derives progression summaries."""

    def __init__(self, uow: UnitOfWork) -> None:
        """Initialize the service.

        Args:
            uow: The active unit of work (transaction + repositories).
        """
        self._uow = uow

    def set_status(self, step_id: str, status: StepStatus) -> PathStep:
        """Update a step's status, stamping ``done_at`` appropriately.

        Args:
            step_id: The step to update.
            status: The new status.

        Returns:
            The updated :class:`PathStep`.

        Raises:
            RepositoryError: If the step does not exist.
        """
        step = self._uow.steps.get(step_id)
        if step is None:
            raise RepositoryError(f"Unknown step: {step_id}")

        now = datetime.now(UTC)
        # Set done_at only on transition to DONE; clear it when reopened so
        # streak calculations never count a re-opened step.
        done_at = now if status is StepStatus.DONE else None
        updated = step.model_copy(
            update={"status": status, "done_at": done_at, "updated_at": now}
        )
        self._uow.steps.update(updated)
        self._uow.commit()
        return updated

    def mark_done(self, step_id: str) -> PathStep:
        """Convenience wrapper marking a step as done.

        Args:
            step_id: The step to complete.

        Returns:
            The updated step.
        """
        return self.set_status(step_id, StepStatus.DONE)

    def summarize(self, path_id: str) -> ProgressSummary:
        """Compute a completion summary for a path.

        Args:
            path_id: The path to summarize.

        Returns:
            A :class:`ProgressSummary` computed entirely from local data.

        Raises:
            RepositoryError: If the path has no steps.
        """
        steps = self._uow.steps.list_by_path(path_id)
        if not steps:
            raise RepositoryError(f"Path {path_id} has no steps.")

        done = [s for s in steps if s.status is StepStatus.DONE]
        next_step = next((s for s in steps if s.status is not StepStatus.DONE), None)
        percent = round(100.0 * len(done) / len(steps), 1)

        return ProgressSummary(
            path_id=path_id,
            total_steps=len(steps),
            done_steps=len(done),
            percent_complete=percent,
            next_step_id=next_step.id if next_step else None,
            streak_days=self._streak_days([s.done_at for s in done]),
        )

    @staticmethod
    def _streak_days(done_timestamps: list[datetime | None]) -> int:
        """Count consecutive days up to today that have a completion.

        Args:
            done_timestamps: ``done_at`` values for completed steps.

        Returns:
            The length of the current daily completion streak (0 if none today).
        """
        # Collapse timestamps to the set of UTC dates on which work was done.
        done_dates: set[date] = {
            ts.astimezone(UTC).date() for ts in done_timestamps if ts is not None
        }
        if not done_dates:
            return 0

        today = datetime.now(UTC).date()
        # A streak must include today; otherwise it has already been broken.
        if today not in done_dates:
            return 0

        streak = 0
        cursor = today
        while cursor in done_dates:
            streak += 1
            cursor -= timedelta(days=1)
        return streak
