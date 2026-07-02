"""Integration tests for the repositories against a real SQLite database."""

from __future__ import annotations

from datetime import UTC, datetime

from stepbylearn.domain.enums import AIProvider, StepStatus
from stepbylearn.domain.models import (
    CalendarEntry,
    LearningPath,
    PathStep,
    StepResource,
)


def _make_path(step_count: int = 2) -> LearningPath:
    path = LearningPath(
        title="Learn X", topic="X", generated_by=AIProvider.CLOUD_ANTHROPIC
    )
    path.steps = [
        PathStep(
            path_id=path.id,
            order_index=i,
            title=f"Step {i}",
            resources=[StepResource(label="Doc", url="https://example.com")],
        )
        for i in range(step_count)
    ]
    return path


def test_add_and_get_roundtrip(make_uow) -> None:
    path = _make_path()
    with make_uow() as uow:
        uow.paths.add(path)
        uow.commit()

    with make_uow() as uow:
        loaded = uow.paths.get(path.id)

    assert loaded is not None
    assert loaded.title == "Learn X"
    assert len(loaded.steps) == 2
    assert str(loaded.steps[0].resources[0].url) == "https://example.com/"


def test_delete_cascades_to_steps_and_calendar(make_uow) -> None:
    path = _make_path()
    with make_uow() as uow:
        uow.paths.add(path)
        uow.calendar.upsert(
            CalendarEntry(
                step_id=path.steps[0].id,
                path_id=path.id,
                scheduled_date=datetime.now(UTC).date(),
            )
        )
        uow.commit()

    with make_uow() as uow:
        assert uow.paths.delete(path.id) is True
        uow.commit()

    with make_uow() as uow:
        assert uow.paths.get(path.id) is None
        assert uow.steps.list_by_path(path.id) == []
        assert uow.calendar.list_by_path(path.id) == []


def test_rollback_discards_partial_writes(make_uow) -> None:
    path = _make_path()
    # Exit the context WITHOUT commit -> nothing should persist.
    with make_uow() as uow:
        uow.paths.add(path)

    with make_uow() as uow:
        assert uow.paths.get(path.id) is None


def test_step_update_persists(make_uow) -> None:
    path = _make_path(1)
    with make_uow() as uow:
        uow.paths.add(path)
        uow.commit()

    with make_uow() as uow:
        step = uow.steps.list_by_path(path.id)[0]
        updated = step.model_copy(update={"status": StepStatus.DONE})
        uow.steps.update(updated)
        uow.commit()

    with make_uow() as uow:
        reloaded = uow.steps.get(path.steps[0].id)
    assert reloaded is not None
    assert reloaded.status is StepStatus.DONE


def test_settings_singleton_defaults_and_save(make_uow) -> None:
    with make_uow() as uow:
        first = uow.settings.get()
        assert first.active_provider is AIProvider.LOCAL_OLLAMA
        updated = first.model_copy(update={"ollama_model": "mistral"})
        uow.settings.save(updated)
        uow.commit()

    with make_uow() as uow:
        assert uow.settings.get().ollama_model == "mistral"
