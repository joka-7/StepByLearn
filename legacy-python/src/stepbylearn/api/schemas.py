"""API request/response DTOs (the HTTP boundary contract).

These are deliberately separate from the domain models: the wire format can
evolve independently, and inbound payloads are validated before they reach the
service layer.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field

from stepbylearn.domain.enums import (
    AIProvider,
    Difficulty,
    ProviderMode,
    StepStatus,
)


class GeneratePathRequest(BaseModel):
    """Request body for generating a new learning path."""

    topic: str = Field(min_length=1, max_length=500)
    difficulty: Difficulty = Difficulty.BEGINNER


class ScheduleRequest(BaseModel):
    """Request body for scheduling a path onto the calendar."""

    start_date: date
    days_between: int = Field(default=1, ge=1, le=365)
    skip_weekends: bool = False
    milestone_every: int = Field(default=0, ge=0, le=100)


class UpdateStepStatusRequest(BaseModel):
    """Request body for changing a step's progression status."""

    status: StepStatus


class UpdateSettingsRequest(BaseModel):
    """Request body for updating provider preferences and (optionally) the key.

    ``cloud_api_key`` is write-only: it is routed straight to the secret store
    and never persisted in settings or echoed back in any response.
    """

    provider_mode: ProviderMode | None = None
    active_provider: AIProvider | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    cloud_model: str | None = None
    request_timeout_s: int | None = Field(default=None, ge=1)
    cloud_api_key: str | None = Field(default=None, repr=False)


class SettingsResponse(BaseModel):
    """Response describing current settings (never includes the secret)."""

    active_provider: AIProvider
    provider_mode: ProviderMode
    ollama_base_url: str
    ollama_model: str
    cloud_model: str | None
    request_timeout_s: int
    has_cloud_key: bool


class ProgressResponse(BaseModel):
    """Response describing a path's completion state."""

    path_id: str
    total_steps: int
    done_steps: int
    percent_complete: float
    next_step_id: str | None
    streak_days: int
