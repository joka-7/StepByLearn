"""Translation between ORM rows and Pydantic domain models.

Keeping this mapping explicit (rather than using the ORM objects as the domain
model) preserves the boundary between persistence and business logic: the domain
never depends on SQLAlchemy, and the physical schema can change independently.
"""

from __future__ import annotations

import json

from pydantic import TypeAdapter

from stepbylearn.db.orm import (
    CalendarEntryRow,
    LearningPathRow,
    PathStepRow,
)
from stepbylearn.domain.enums import AIProvider, Difficulty, StepStatus, SyncState
from stepbylearn.domain.models import (
    CalendarEntry,
    LearningPath,
    PathStep,
    StepResource,
)

# Reusable adapter for (de)serializing the resource list to/from JSON text.
_RESOURCES_ADAPTER: TypeAdapter[list[StepResource]] = TypeAdapter(list[StepResource])


def encode_resources(resources: list[StepResource]) -> str:
    """Serialize step resources to a compact JSON string for storage.

    Args:
        resources: The resource list from a domain model.

    Returns:
        A JSON array string (``HttpUrl`` values rendered as plain strings).
    """
    return _RESOURCES_ADAPTER.dump_json(resources).decode("utf-8")


def decode_resources(raw: str) -> list[StepResource]:
    """Deserialize a stored JSON string back into step resources.

    Args:
        raw: The stored JSON array string.

    Returns:
        The validated list of resources (empty list for null/blank input).
    """
    if not raw:
        return []
    return _RESOURCES_ADAPTER.validate_python(json.loads(raw))


# --------------------------------------------------------------------------- #
# PathStep
# --------------------------------------------------------------------------- #
def step_to_row(step: PathStep) -> PathStepRow:
    """Map a :class:`PathStep` domain model to its ORM row.

    Args:
        step: The domain step.

    Returns:
        A new, unpersisted :class:`PathStepRow`.
    """
    return PathStepRow(
        id=step.id,
        path_id=step.path_id,
        order_index=step.order_index,
        title=step.title,
        content=step.content,
        resources_json=encode_resources(step.resources),
        estimated_minutes=step.estimated_minutes,
        status=step.status.value,
        done_at=step.done_at,
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


def step_from_row(row: PathStepRow) -> PathStep:
    """Map an ORM :class:`PathStepRow` to its domain model.

    Args:
        row: The persisted row.

    Returns:
        The validated :class:`PathStep`.
    """
    return PathStep(
        id=row.id,
        path_id=row.path_id,
        order_index=row.order_index,
        title=row.title,
        content=row.content,
        resources=decode_resources(row.resources_json),
        estimated_minutes=row.estimated_minutes,
        status=StepStatus(row.status),
        done_at=row.done_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# --------------------------------------------------------------------------- #
# LearningPath
# --------------------------------------------------------------------------- #
def path_to_row(
    path: LearningPath, *, syllabus_json: str | None = None
) -> LearningPathRow:
    """Map a :class:`LearningPath` (and its steps) to ORM rows.

    Args:
        path: The domain path aggregate.
        syllabus_json: Optional raw validated syllabus snapshot to retain.

    Returns:
        A :class:`LearningPathRow` with its ``steps`` relationship populated.
    """
    row = LearningPathRow(
        id=path.id,
        title=path.title,
        topic=path.topic,
        description=path.description,
        difficulty=path.difficulty.value,
        estimated_hours=path.estimated_hours,
        generated_by=path.generated_by.value,
        model_name=path.model_name,
        syllabus_json=syllabus_json,
        created_at=path.created_at,
        updated_at=path.updated_at,
    )
    row.steps = [step_to_row(step) for step in path.steps]
    return row


def path_from_row(row: LearningPathRow) -> LearningPath:
    """Map an ORM :class:`LearningPathRow` (with steps) to its domain model.

    Args:
        row: The persisted path row.

    Returns:
        The validated :class:`LearningPath` including ordered steps.
    """
    return LearningPath(
        id=row.id,
        title=row.title,
        topic=row.topic,
        description=row.description,
        difficulty=Difficulty(row.difficulty),
        estimated_hours=row.estimated_hours,
        generated_by=AIProvider(row.generated_by),
        model_name=row.model_name,
        steps=[step_from_row(step) for step in row.steps],
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# --------------------------------------------------------------------------- #
# CalendarEntry
# --------------------------------------------------------------------------- #
def calendar_to_row(entry: CalendarEntry) -> CalendarEntryRow:
    """Map a :class:`CalendarEntry` domain model to its ORM row.

    Args:
        entry: The domain calendar entry.

    Returns:
        A new, unpersisted :class:`CalendarEntryRow`.
    """
    return CalendarEntryRow(
        id=entry.id,
        step_id=entry.step_id,
        path_id=entry.path_id,
        scheduled_date=entry.scheduled_date,
        start_time=entry.start_time,
        duration_minutes=entry.duration_minutes,
        is_milestone=entry.is_milestone,
        sync_state=entry.sync_state.value,
        external_ref=entry.external_ref,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def calendar_from_row(row: CalendarEntryRow) -> CalendarEntry:
    """Map an ORM :class:`CalendarEntryRow` to its domain model.

    Args:
        row: The persisted row.

    Returns:
        The validated :class:`CalendarEntry`.
    """
    return CalendarEntry(
        id=row.id,
        step_id=row.step_id,
        path_id=row.path_id,
        scheduled_date=row.scheduled_date,
        start_time=row.start_time,
        duration_minutes=row.duration_minutes,
        is_milestone=row.is_milestone,
        sync_state=SyncState(row.sync_state),
        external_ref=row.external_ref,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
