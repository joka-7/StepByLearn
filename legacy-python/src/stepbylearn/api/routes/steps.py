"""Step progression routes (fully offline)."""

from __future__ import annotations

from fastapi import APIRouter

from stepbylearn.api.deps import ContainerDep
from stepbylearn.api.schemas import ProgressResponse, UpdateStepStatusRequest
from stepbylearn.domain.models import PathStep
from stepbylearn.services.progress_service import ProgressService

router = APIRouter(prefix="/api", tags=["progress"])


@router.patch("/steps/{step_id}/status")
async def update_step_status(
    step_id: str, body: UpdateStepStatusRequest, container: ContainerDep
) -> PathStep:
    """Update a step's progression status.

    Args:
        step_id: The step to update.
        body: The new status.
        container: The application container.

    Returns:
        The updated step.
    """
    with container.new_uow() as uow:
        service = ProgressService(uow)
        return service.set_status(step_id, body.status)


@router.get("/paths/{path_id}/progress")
async def get_progress(path_id: str, container: ContainerDep) -> ProgressResponse:
    """Return a computed progression summary for a path.

    Args:
        path_id: The path to summarize.
        container: The application container.

    Returns:
        The completion summary (computed entirely from local data).
    """
    with container.new_uow() as uow:
        summary = ProgressService(uow).summarize(path_id)
    return ProgressResponse(
        path_id=summary.path_id,
        total_steps=summary.total_steps,
        done_steps=summary.done_steps,
        percent_complete=summary.percent_complete,
        next_step_id=summary.next_step_id,
        streak_days=summary.streak_days,
    )
