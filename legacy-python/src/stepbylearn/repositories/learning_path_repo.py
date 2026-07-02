"""SQLAlchemy implementation of the learning-path repository."""

from __future__ import annotations

from typing import cast

from sqlalchemy import CursorResult, delete, select
from sqlalchemy.orm import Session, selectinload

from stepbylearn.db import mappers
from stepbylearn.db.orm import LearningPathRow
from stepbylearn.domain.models import LearningPath


class LearningPathRepository:
    """Read/write access to :class:`LearningPath` aggregates in SQLite."""

    def __init__(self, session: Session) -> None:
        """Initialize the repository.

        Args:
            session: The active SQLAlchemy session (owned by the unit of work).
        """
        self._session = session

    def add(self, path: LearningPath, *, syllabus_json: str | None = None) -> None:
        """Persist a new path together with its ordered steps.

        Args:
            path: The path aggregate to store.
            syllabus_json: Optional raw validated syllabus snapshot for audit.
        """
        self._session.add(mappers.path_to_row(path, syllabus_json=syllabus_json))

    def get(self, path_id: str) -> LearningPath | None:
        """Return a path with its steps eagerly loaded.

        Args:
            path_id: The path identifier.

        Returns:
            The domain path, or ``None`` when no such path exists.
        """
        # selectinload avoids the N+1 problem when materializing steps.
        stmt = (
            select(LearningPathRow)
            .where(LearningPathRow.id == path_id)
            .options(selectinload(LearningPathRow.steps))
        )
        row = self._session.scalars(stmt).one_or_none()
        return mappers.path_from_row(row) if row is not None else None

    def list_all(self) -> list[LearningPath]:
        """Return every path (with steps), newest first.

        Returns:
            All stored paths ordered by descending creation time.
        """
        stmt = (
            select(LearningPathRow)
            .options(selectinload(LearningPathRow.steps))
            .order_by(LearningPathRow.created_at.desc())
        )
        return [mappers.path_from_row(row) for row in self._session.scalars(stmt)]

    def delete(self, path_id: str) -> bool:
        """Delete a path and cascade to its steps and calendar entries.

        Args:
            path_id: The path identifier.

        Returns:
            ``True`` if a row was deleted, ``False`` if none matched.
        """
        # ``execute`` is typed as returning ``Result`` but a Core DELETE yields a
        # ``CursorResult`` exposing ``rowcount``; cast to satisfy the type checker.
        result = cast(
            CursorResult[object],
            self._session.execute(
                delete(LearningPathRow).where(LearningPathRow.id == path_id)
            ),
        )
        return result.rowcount > 0
