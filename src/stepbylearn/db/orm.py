"""SQLAlchemy 2.0 ORM table definitions (the physical schema).

These mapped classes describe *rows*, not domain behavior. They are translated
to and from the Pydantic domain models by :mod:`stepbylearn.db.mappers`, keeping
the persistence shape decoupled from the business model.

Design notes:
    * String UUIDv7 primary keys are generated in the domain layer, not the DB.
    * Enums are stored as their string values (``TEXT``) for self-describing data.
    * ``ON DELETE CASCADE`` guarantees deleting a path removes its steps and
      calendar entries. SQLite only enforces this when ``PRAGMA foreign_keys``
      is ON, which :mod:`stepbylearn.db.engine` enables per connection.
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    LargeBinary,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all StepByLearn ORM models."""


class LearningPathRow(Base):
    """Row model for the ``learning_paths`` table."""

    __tablename__ = "learning_paths"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    topic: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="", nullable=False)
    difficulty: Mapped[str] = mapped_column(String, nullable=False)
    estimated_hours: Mapped[float | None] = mapped_column(nullable=True)
    generated_by: Mapped[str] = mapped_column(String, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # Raw validated syllabus snapshot retained for audit/debugging of the LLM.
    syllabus_json: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False)
    updated_at: Mapped[datetime] = mapped_column(nullable=False)

    steps: Mapped[list[PathStepRow]] = relationship(
        back_populates="path",
        cascade="all, delete-orphan",
        order_by="PathStepRow.order_index",
        passive_deletes=True,
    )


class PathStepRow(Base):
    """Row model for the ``path_steps`` table."""

    __tablename__ = "path_steps"
    __table_args__ = (
        # Two steps in the same path may never share an ordinal position.
        UniqueConstraint("path_id", "order_index", name="uq_step_order"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    path_id: Mapped[str] = mapped_column(
        ForeignKey("learning_paths.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(String, default="", nullable=False)
    # JSON-encoded list[{"label": str, "url": str}].
    resources_json: Mapped[str] = mapped_column(String, default="[]", nullable=False)
    estimated_minutes: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False)
    done_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False)
    updated_at: Mapped[datetime] = mapped_column(nullable=False)

    path: Mapped[LearningPathRow] = relationship(back_populates="steps")
    calendar_entry: Mapped[CalendarEntryRow | None] = relationship(
        back_populates="step",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )


class CalendarEntryRow(Base):
    """Row model for the ``calendar_entries`` table."""

    __tablename__ = "calendar_entries"
    __table_args__ = (
        # A step maps to at most one calendar entry (1:0..1).
        UniqueConstraint("step_id", name="uq_calendar_step"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    step_id: Mapped[str] = mapped_column(
        ForeignKey("path_steps.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Denormalized for fast per-path calendar range queries.
    path_id: Mapped[str] = mapped_column(
        ForeignKey("learning_paths.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scheduled_date: Mapped[date] = mapped_column(nullable=False, index=True)
    start_time: Mapped[time | None] = mapped_column(nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(nullable=True)
    is_milestone: Mapped[bool] = mapped_column(default=False, nullable=False)
    sync_state: Mapped[str] = mapped_column(String, nullable=False)
    external_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False)
    updated_at: Mapped[datetime] = mapped_column(nullable=False)

    step: Mapped[PathStepRow] = relationship(back_populates="calendar_entry")


class AppSettingsRow(Base):
    """Row model for the singleton ``app_settings`` table (always ``id == 1``)."""

    __tablename__ = "app_settings"
    __table_args__ = (
        # Enforce the singleton invariant at the storage level.
        CheckConstraint("id = 1", name="ck_settings_singleton"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    active_provider: Mapped[str] = mapped_column(String, nullable=False)
    provider_mode: Mapped[str] = mapped_column(String, nullable=False)
    ollama_base_url: Mapped[str] = mapped_column(String, nullable=False)
    ollama_model: Mapped[str] = mapped_column(String, nullable=False)
    cloud_model: Mapped[str | None] = mapped_column(String, nullable=True)
    # Opaque handle into the OS keyring — NEVER the secret itself.
    cloud_key_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    # Fernet-encrypted key, populated ONLY in the keyring-less fallback mode.
    cloud_key_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    request_timeout_s: Mapped[int] = mapped_column(nullable=False)
    updated_at: Mapped[datetime] = mapped_column(nullable=False)
