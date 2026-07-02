"""Health and engine-availability probes."""

from __future__ import annotations

from fastapi import APIRouter

from stepbylearn.ai.local_ollama import LocalOllamaStrategy
from stepbylearn.api.deps import ContainerDep

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def health() -> dict[str, str]:
    """Return a simple liveness signal.

    Returns:
        A static status payload.
    """
    return {"status": "ok"}


@router.get("/api/engines")
async def engines(container: ContainerDep) -> dict[str, bool]:
    """Report which AI backends are currently reachable.

    Lets the UI show the user whether local/cloud generation is available before
    they attempt to generate.

    Args:
        container: The application container.

    Returns:
        Availability flags for the local and cloud engines.
    """
    with container.new_uow() as uow:
        settings = uow.settings.get()
        has_cloud_key = container.secret_store.has_key(uow.settings)

    local = LocalOllamaStrategy(settings.ollama_base_url, settings.ollama_model)
    return {
        "local_ollama": await local.health_check(),
        "cloud_key_present": has_cloud_key,
    }
