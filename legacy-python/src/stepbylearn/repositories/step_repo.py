"""SQLAlchemy implementation of the step repository."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from stepbylearn.db import mappers
from stepbylearn.db.orm import PathStepRow
from stepbylearn.domain.exceptions import RepositoryError
from stepbylearn.domain.models import PathStep


class StepRepository:
    """Read/write access to individual :class:`PathStep` rows."""

    def __init__(self, session: Session) -> None:
        """Initialize the repository.

        Args:
            session: The active SQLAlchemy session (owned by the unit of work).
        """
        self._session = session

    def get(self, step_id: str) -> PathStep | None:
        """Return a single step by id.

        Args:
            step_id: The step identifier.

        Returns:
            The domain step, or ``None`` when absent.
        """
        row = self._session.get(PathStepRow, step_id)
        return mappers.step_from_row(row) if row is not None else None

    def list_by_path(self, path_id: str) -> list[PathStep]:
        """Return a path's steps ordered by ``order_index``.

        Args:
            path_id: The owning path identifier.

        Returns:
            The ordered list of steps (empty if the path has none).
        """
        stmt = (
            select(PathStepRow)
            .where(PathStepRow.path_id == path_id)
            .order_by(PathStepRow.order_index)
        )
        return [mappers.step_from_row(row) for row in self._session.scalars(stmt)]

    def update(self, step: PathStep) -> None:
        """Persist mutations to an existing step.

        Args:
            step: The step carrying updated field values.

        Raises:
            RepositoryError: If the step does not exist.
        """
        row = self._session.get(PathStepRow, step.id)
        if row is None:
            raise RepositoryError(f"Cannot update unknown step: {step.id}")

        # Update only the mutable fields; identity/order are managed elsewhere.
        row.title = step.title
        row.content = step.content
        row.resources_json = mappers.encode_resources(step.resources)
        row.estimated_minutes = step.estimated_minutes
        row.status = step.status.value
        row.done_at = step.done_at
        row.updated_at = step.updated_at
