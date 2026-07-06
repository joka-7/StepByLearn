"""Enumerations shared across the domain.

All enums subclass ``str`` so their members serialize directly to human-readable
values in JSON payloads and SQLite ``TEXT`` columns, keeping the persisted data
self-describing and debuggable.
"""

from __future__ import annotations

from enum import StrEnum


class AIProvider(StrEnum):
    """The concrete AI backend that produced (or will produce) a generation."""

    LOCAL_OLLAMA = "local_ollama"
    CLOUD_ANTHROPIC = "cloud_anthropic"


class ProviderMode(StrEnum):
    """User preference governing how a strategy is resolved at runtime.

    - ``AUTO``: prefer local/free; use cloud only when a key exists and the
      network is reachable.
    - ``FORCE_LOCAL``: always use the local Ollama engine.
    - ``FORCE_CLOUD``: always use the cloud engine (error if no key).
    """

    AUTO = "auto"
    FORCE_LOCAL = "force_local"
    FORCE_CLOUD = "force_cloud"


class Difficulty(StrEnum):
    """Coarse difficulty rating for a learning path."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class StepStatus(StrEnum):
    """Progression state of a single learning step (fully offline)."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class SyncState(StrEnum):
    """Calendar-entry synchronization state.

    Everything is ``LOCAL_ONLY`` by default; the other states exist so an
    *optional*, explicitly user-triggered export to an external calendar can be
    layered on later without a schema migration.
    """

    LOCAL_ONLY = "local_only"
    PENDING_EXPORT = "pending_export"
    EXPORTED = "exported"
