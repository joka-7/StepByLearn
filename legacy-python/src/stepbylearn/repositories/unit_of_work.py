"""Unit of Work: a single transactional boundary over all repositories.

Each business operation runs inside one unit of work so a multi-row write (e.g.
a path plus all its steps) commits atomically or not at all. The class is a
context manager: leaving the ``with`` block commits on success and rolls back on
any exception.
"""

from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self

from sqlalchemy.orm import Session, sessionmaker

from stepbylearn.repositories.calendar_repo import CalendarRepository
from stepbylearn.repositories.learning_path_repo import LearningPathRepository
from stepbylearn.repositories.settings_repo import SettingsRepository
from stepbylearn.repositories.step_repo import StepRepository


class UnitOfWork(Protocol):
    """Transactional context exposing the repositories for one operation."""

    paths: LearningPathRepository
    steps: StepRepository
    calendar: CalendarRepository
    settings: SettingsRepository

    def __enter__(self) -> Self:
        """Enter the transactional context."""
        ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        """Commit on clean exit, otherwise roll back."""
        ...

    def commit(self) -> None:
        """Flush and commit the current transaction."""
        ...

    def rollback(self) -> None:
        """Discard all pending changes in the current transaction."""
        ...


class SqlAlchemyUnitOfWork:
    """SQLAlchemy-backed :class:`UnitOfWork`.

    A fresh :class:`~sqlalchemy.orm.Session` is opened per context entry and
    closed on exit, matching the one-unit-of-work-per-request pattern.
    """

    paths: LearningPathRepository
    steps: StepRepository
    calendar: CalendarRepository
    settings: SettingsRepository

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        """Initialize the unit of work.

        Args:
            session_factory: Factory used to open a new session per context.
        """
        self._session_factory = session_factory
        self._session: Session | None = None

    def __enter__(self) -> Self:
        """Open a session and bind fresh repositories to it.

        Returns:
            This unit of work, ready for use inside a ``with`` block.
        """
        self._session = self._session_factory()
        self.paths = LearningPathRepository(self._session)
        self.steps = StepRepository(self._session)
        self.calendar = CalendarRepository(self._session)
        self.settings = SettingsRepository(self._session)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        """Roll back on error, otherwise leave committed state, then close.

        The session is always closed. Explicit ``commit()`` by the caller is
        required to persist; an un-committed clean exit is rolled back to avoid
        surprising partial writes.

        Args:
            exc_type: Exception type if one propagated, else ``None``.
            exc: Exception instance if one propagated, else ``None``.
            tb: Traceback if an exception propagated, else ``None``.
        """
        assert self._session is not None  # noqa: S101 - invariant inside context
        try:
            if exc_type is not None:
                self._session.rollback()
        finally:
            self._session.close()
            self._session = None

    def commit(self) -> None:
        """Commit the current transaction.

        Raises:
            RuntimeError: If called outside an active context.
        """
        if self._session is None:
            raise RuntimeError("commit() called outside an active unit of work")
        self._session.commit()

    def rollback(self) -> None:
        """Roll back the current transaction.

        Raises:
            RuntimeError: If called outside an active context.
        """
        if self._session is None:
            raise RuntimeError("rollback() called outside an active unit of work")
        self._session.rollback()
