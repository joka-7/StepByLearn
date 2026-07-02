"""Calendar scheduling and retrieval routes."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from stepbylearn.api.deps import ContainerDep
from stepbylearn.api.schemas import ScheduleRequest
from stepbylearn.domain.models import CalendarEntry
from stepbylearn.services.calendar_service import CalendarService, ScheduleOptions

router = APIRouter(prefix="/api", tags=["calendar"])


@router.post("/paths/{path_id}/schedule")
async def schedule_path(
    path_id: str, body: ScheduleRequest, container: ContainerDep
) -> list[CalendarEntry]:
    """Map a path's steps onto calendar dates.

    Args:
        path_id: The path to schedule.
        body: Scheduling parameters.
        container: The application container.

    Returns:
        The created/updated calendar entries.
    """
    options = ScheduleOptions(
        start_date=body.start_date,
        days_between=body.days_between,
        skip_weekends=body.skip_weekends,
        milestone_every=body.milestone_every,
    )
    with container.new_uow() as uow:
        return CalendarService(uow).schedule_path(path_id, options)


@router.get("/paths/{path_id}/calendar")
async def path_calendar(path_id: str, container: ContainerDep) -> list[CalendarEntry]:
    """Return all calendar entries for a path.

    Args:
        path_id: The path identifier.
        container: The application container.

    Returns:
        Calendar entries ordered by date.
    """
    with container.new_uow() as uow:
        return uow.calendar.list_by_path(path_id)


@router.get("/calendar")
async def calendar_range(
    container: ContainerDep,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
) -> list[CalendarEntry]:
    """Return calendar entries within an inclusive date range.

    Args:
        container: The application container.
        start: Inclusive lower bound.
        end: Inclusive upper bound.

    Returns:
        Matching calendar entries ordered by date.
    """
    with container.new_uow() as uow:
        return uow.calendar.list_in_range(start, end)
