"""Learning-path generation and retrieval routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from stepbylearn.api.deps import ContainerDep
from stepbylearn.api.schemas import GeneratePathRequest
from stepbylearn.domain.models import LearningPath
from stepbylearn.services.path_generation import PathGenerationService

router = APIRouter(prefix="/api/paths", tags=["paths"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def generate_path(
    body: GeneratePathRequest, container: ContainerDep
) -> LearningPath:
    """Generate a new learning path and persist it locally.

    Args:
        body: The generation request (topic + difficulty).
        container: The application container.

    Returns:
        The newly created path with its ordered steps.
    """
    with container.new_uow() as uow:
        service = PathGenerationService(uow, container.resolver)
        return await service.generate_path(body.topic, body.difficulty)


@router.get("")
async def list_paths(container: ContainerDep) -> list[LearningPath]:
    """List all locally stored learning paths (newest first).

    Args:
        container: The application container.

    Returns:
        Every stored path with its steps.
    """
    with container.new_uow() as uow:
        return uow.paths.list_all()


@router.get("/{path_id}")
async def get_path(path_id: str, container: ContainerDep) -> LearningPath:
    """Retrieve a single learning path by id.

    Args:
        path_id: The path identifier.
        container: The application container.

    Returns:
        The requested path.

    Raises:
        HTTPException: 404 if the path does not exist.
    """
    with container.new_uow() as uow:
        path = uow.paths.get(path_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Path not found")
    return path


@router.delete("/{path_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_path(path_id: str, container: ContainerDep) -> None:
    """Delete a path and everything cascading from it.

    Args:
        path_id: The path identifier.
        container: The application container.

    Raises:
        HTTPException: 404 if the path does not exist.
    """
    with container.new_uow() as uow:
        deleted = uow.paths.delete(path_id)
        uow.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="Path not found")
