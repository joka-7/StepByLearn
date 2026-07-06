"""Domain models (Pydantic v2).

Two families of model live here:

1. **Persisted aggregates** (:class:`LearningPath`, :class:`PathStep`,
   :class:`CalendarEntry`, :class:`AppSettings`) — the validated in-memory
   representation of rows owned by the repositories.
2. **LLM draft models** (:class:`SyllabusDraft`, :class:`SyllabusStepDraft`) —
   the shape the AI is asked to emit. They are deliberately permissive on
   structure but strict on required fields so the JSON healer can coerce fragile
   output into a single, trusted schema.

Timestamps are timezone-aware UTC. IDs default to UUIDv7 strings so objects can
be created offline without a database round-trip.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from stepbylearn.domain.enums import (
    AIProvider,
    Difficulty,
    ProviderMode,
    StepStatus,
    SyncState,
)
from stepbylearn.domain.ids import new_id


def _utcnow() -> datetime:
    """Return the current timezone-aware UTC timestamp.

    Returns:
        The current instant in UTC.
    """
    return datetime.now(UTC)


class StepResource(BaseModel):
    """A single external reference attached to a learning step."""

    label: str = Field(min_length=1)
    url: HttpUrl


# --------------------------------------------------------------------------- #
# LLM draft models — the schema the AI is prompted to produce.
# --------------------------------------------------------------------------- #
class SyllabusStepDraft(BaseModel):
    """One step as emitted by the LLM before it becomes a :class:`PathStep`.

    ``model_config`` forbids unknown keys so hallucinated fields surface as
    validation errors (triggering the corrective re-prompt) rather than being
    silently dropped.
    """

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    content: str = ""
    resources: list[StepResource] = Field(default_factory=list)
    estimated_minutes: int | None = Field(default=None, ge=0)


class SyllabusDraft(BaseModel):
    """The full syllabus as emitted by the LLM.

    This is the target model for :func:`stepbylearn.ai.json_healer.heal_and_validate`.
    """

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    description: str = ""
    difficulty: Difficulty = Difficulty.BEGINNER
    estimated_hours: float | None = Field(default=None, ge=0)
    steps: list[SyllabusStepDraft] = Field(min_length=1)


# --------------------------------------------------------------------------- #
# Persisted aggregates.
# --------------------------------------------------------------------------- #
class PathStep(BaseModel):
    """An ordered, individually trackable unit of a learning path."""

    id: str = Field(default_factory=new_id)
    path_id: str
    order_index: int = Field(ge=0)
    title: str = Field(min_length=1)
    content: str = ""
    resources: list[StepResource] = Field(default_factory=list)
    estimated_minutes: int | None = Field(default=None, ge=0)
    status: StepStatus = StepStatus.NOT_STARTED
    done_at: datetime | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class LearningPath(BaseModel):
    """The top-level aggregate: a titled path composed of ordered steps."""

    id: str = Field(default_factory=new_id)
    title: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    description: str = ""
    difficulty: Difficulty = Difficulty.BEGINNER
    estimated_hours: float | None = Field(default=None, ge=0)
    generated_by: AIProvider
    model_name: str | None = None
    steps: list[PathStep] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class CalendarEntry(BaseModel):
    """Places a single step on the calendar timeline.

    A step has at most one calendar entry (enforced by a unique constraint in
    the persistence layer).
    """

    id: str = Field(default_factory=new_id)
    step_id: str
    path_id: str
    scheduled_date: date
    start_time: time | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    is_milestone: bool = False
    sync_state: SyncState = SyncState.LOCAL_ONLY
    external_ref: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class AppSettings(BaseModel):
    """Singleton application settings and AI provider preferences.

    The cloud API key is *never* stored on this model; only ``cloud_key_ref``
    (an opaque handle into the OS keyring) travels with settings. The secret
    itself is resolved on demand by the security layer.
    """

    active_provider: AIProvider = AIProvider.LOCAL_OLLAMA
    provider_mode: ProviderMode = ProviderMode.AUTO
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    cloud_model: str | None = None
    cloud_key_ref: str | None = None
    request_timeout_s: int = Field(default=120, ge=1)
    updated_at: datetime = Field(default_factory=_utcnow)

    @field_validator("ollama_base_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        """Normalize the Ollama base URL by trimming a trailing slash.

        Args:
            value: The raw configured URL.

        Returns:
            The URL without a trailing slash, so path joins are unambiguous.
        """
        return value.rstrip("/")
