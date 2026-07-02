"""Settings and provider-preference routes (including safe key storage)."""

from __future__ import annotations

from fastapi import APIRouter

from stepbylearn.api.deps import ContainerDep
from stepbylearn.api.schemas import SettingsResponse, UpdateSettingsRequest

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _to_response(container: ContainerDep, *, has_key: bool) -> SettingsResponse:
    """Build a settings response from current state.

    Args:
        container: The application container.
        has_key: Whether a cloud key is stored.

    Returns:
        The settings response (never containing the secret).
    """
    with container.new_uow() as uow:
        s = uow.settings.get()
    return SettingsResponse(
        active_provider=s.active_provider,
        provider_mode=s.provider_mode,
        ollama_base_url=s.ollama_base_url,
        ollama_model=s.ollama_model,
        cloud_model=s.cloud_model,
        request_timeout_s=s.request_timeout_s,
        has_cloud_key=has_key,
    )


@router.get("")
async def get_settings_route(container: ContainerDep) -> SettingsResponse:
    """Return current settings and whether a cloud key is present.

    Args:
        container: The application container.

    Returns:
        The current settings (secret never included).
    """
    with container.new_uow() as uow:
        has_key = container.secret_store.has_key(uow.settings)
    return _to_response(container, has_key=has_key)


@router.put("")
async def update_settings_route(
    body: UpdateSettingsRequest, container: ContainerDep
) -> SettingsResponse:
    """Update provider preferences and optionally store/replace the cloud key.

    The API key (when provided) is routed to the secret store and the opaque
    keyring reference is recorded on settings; the plaintext is never persisted
    in the settings row nor returned.

    Args:
        body: The partial settings update.
        container: The application container.

    Returns:
        The updated settings.
    """
    with container.new_uow() as uow:
        current = uow.settings.get()

        # Apply only the provided (non-None) preference fields.
        updates = body.model_dump(exclude_none=True, exclude={"cloud_api_key"})
        merged = current.model_copy(update=updates)

        if body.cloud_api_key is not None:
            container.secret_store.set_key(body.cloud_api_key, uow.settings)
            merged = merged.model_copy(
                update={"cloud_key_ref": container.secret_store.key_ref}
            )

        uow.settings.save(merged)
        uow.commit()
        has_key = container.secret_store.has_key(uow.settings)

    return _to_response(container, has_key=has_key)
