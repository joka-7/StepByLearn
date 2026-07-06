"""Repository layer: offline-capable data access behind stable interfaces.

Consumers depend only on the abstract protocols and the :class:`UnitOfWork`;
the concrete implementations wrap SQLAlchemy sessions. Swapping SQLite for a
different backend means providing new implementations here, with no changes to
the services above.
"""

from stepbylearn.repositories.calendar_repo import CalendarRepository
from stepbylearn.repositories.learning_path_repo import LearningPathRepository
from stepbylearn.repositories.settings_repo import SettingsRepository
from stepbylearn.repositories.step_repo import StepRepository
from stepbylearn.repositories.unit_of_work import (
    SqlAlchemyUnitOfWork,
    UnitOfWork,
)

__all__ = [
    "CalendarRepository",
    "LearningPathRepository",
    "SettingsRepository",
    "SqlAlchemyUnitOfWork",
    "StepRepository",
    "UnitOfWork",
]
