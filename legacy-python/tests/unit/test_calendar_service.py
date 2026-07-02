"""Tests for calendar scheduling logic."""

from __future__ import annotations

from datetime import date

import pytest

from stepbylearn.domain.enums import AIProvider
from stepbylearn.domain.exceptions import RepositoryError
from stepbylearn.domain.models import LearningPath, PathStep
from stepbylearn.services.calendar_service import CalendarService, ScheduleOptions


def _seed_path(uow, step_count: int) -> str:
    path = LearningPath(title="T", topic="X", generated_by=AIProvider.LOCAL_OLLAMA)
    path.steps = [
        PathStep(path_id=path.id, order_index=i, title=f"s{i}")
        for i in range(step_count)
    ]
    uow.paths.add(path)
    uow.commit()
    return path.id


def test_schedule_advances_by_days_between(make_uow) -> None:
    with make_uow() as uow:
        path_id = _seed_path(uow, 3)
        options = ScheduleOptions(start_date=date(2026, 7, 1), days_between=2)
        entries = CalendarService(uow).schedule_path(path_id, options)

    dates = [e.scheduled_date for e in entries]
    assert dates == [date(2026, 7, 1), date(2026, 7, 3), date(2026, 7, 5)]


def test_schedule_skips_weekends(make_uow) -> None:
    with make_uow() as uow:
        path_id = _seed_path(uow, 3)
        # 2026-07-03 is a Friday; the next weekday is Monday 2026-07-06.
        options = ScheduleOptions(
            start_date=date(2026, 7, 3), days_between=1, skip_weekends=True
        )
        entries = CalendarService(uow).schedule_path(path_id, options)

    dates = [e.scheduled_date for e in entries]
    assert dates == [date(2026, 7, 3), date(2026, 7, 6), date(2026, 7, 7)]


def test_milestone_every_marks_correct_steps(make_uow) -> None:
    with make_uow() as uow:
        path_id = _seed_path(uow, 4)
        options = ScheduleOptions(start_date=date(2026, 7, 1), milestone_every=2)
        entries = CalendarService(uow).schedule_path(path_id, options)

    assert [e.is_milestone for e in entries] == [False, True, False, True]


def test_reschedule_is_idempotent(make_uow) -> None:
    with make_uow() as uow:
        path_id = _seed_path(uow, 2)
        service = CalendarService(uow)
        service.schedule_path(path_id, ScheduleOptions(start_date=date(2026, 7, 1)))
        service.schedule_path(path_id, ScheduleOptions(start_date=date(2026, 8, 1)))
        entries = uow.calendar.list_by_path(path_id)

    # Re-scheduling overwrites rather than duplicating.
    assert len(entries) == 2
    assert entries[0].scheduled_date == date(2026, 8, 1)


def test_schedule_empty_path_raises(make_uow) -> None:
    with make_uow() as uow:
        path_id = _seed_path(uow, 0)
        with pytest.raises(RepositoryError):
            CalendarService(uow).schedule_path(
                path_id, ScheduleOptions(start_date=date(2026, 7, 1))
            )
