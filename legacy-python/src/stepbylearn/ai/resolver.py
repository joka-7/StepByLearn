"""Runtime AI strategy resolution (the Strategy Pattern's selection logic).

Chooses between the local Ollama engine and the cloud Anthropic engine for each
generation request, honoring the user's :class:`ProviderMode` and degrading
gracefully when a backend is unreachable. All probes are cheap and
timeout-guarded so a hung daemon or dead network never freezes the caller.
"""

from __future__ import annotations

import httpx

from stepbylearn.ai.base import AIStrategy
from stepbylearn.ai.cloud_anthropic import CloudAnthropicStrategy
from stepbylearn.ai.local_ollama import LocalOllamaStrategy
from stepbylearn.domain.enums import ProviderMode
from stepbylearn.domain.exceptions import ConfigError, NoAvailableEngineError
from stepbylearn.domain.models import AppSettings
from stepbylearn.repositories.settings_repo import SettingsRepository
from stepbylearn.security.secret_store import SecretStore

# Host used purely as a connectivity probe target for the cloud backend.
_ANTHROPIC_PROBE_URL = "https://api.anthropic.com"


class StrategyResolver:
    """Resolves the concrete :class:`AIStrategy` to use for a request."""

    def __init__(self, secret_store: SecretStore) -> None:
        """Initialize the resolver.

        Args:
            secret_store: Store used to detect/fetch the cloud API key.
        """
        self._secret_store = secret_store

    async def resolve(
        self,
        settings: AppSettings,
        settings_repo: SettingsRepository,
    ) -> AIStrategy:
        """Resolve a usable AI strategy for the current settings and environment.

        Selection logic:

        * ``FORCE_CLOUD`` — require a key (else :class:`ConfigError`); use cloud.
        * ``FORCE_LOCAL`` — always use local Ollama (offline default).
        * ``AUTO`` — prefer cloud only when a key exists *and* the network is
          reachable *and* the backend health-checks; otherwise fall back to a
          reachable local daemon; if neither is available, raise
          :class:`NoAvailableEngineError` with actionable hints.

        Args:
            settings: Current application settings/preferences.
            settings_repo: Repository used by the secret store's fallback path.

        Returns:
            A ready-to-use :class:`AIStrategy`.

        Raises:
            ConfigError: If cloud is forced but no key is stored.
            NoAvailableEngineError: If no backend can be resolved.
        """
        if settings.provider_mode is ProviderMode.FORCE_CLOUD:
            return self._require_cloud(settings, settings_repo)

        if settings.provider_mode is ProviderMode.FORCE_LOCAL:
            return self._build_local(settings)

        return await self._resolve_auto(settings, settings_repo)

    # ------------------------------------------------------------------ #
    # Mode handlers
    # ------------------------------------------------------------------ #
    def _require_cloud(
        self,
        settings: AppSettings,
        settings_repo: SettingsRepository,
    ) -> CloudAnthropicStrategy:
        """Build the cloud strategy, erroring if no key is available.

        Args:
            settings: Current settings (for the model + timeout).
            settings_repo: Repository backing the secret store fallback.

        Returns:
            A configured cloud strategy.

        Raises:
            ConfigError: If no cloud key is stored.
        """
        key = self._secret_store.get_key(settings_repo)
        if not key:
            raise ConfigError(
                "Cloud provider is forced but no API key is stored. "
                "Add a key in settings or switch to local mode."
            )
        return self._build_cloud(settings, key)

    async def _resolve_auto(
        self,
        settings: AppSettings,
        settings_repo: SettingsRepository,
    ) -> AIStrategy:
        """Resolve a strategy under the privacy-preferring ``AUTO`` policy.

        Args:
            settings: Current settings/preferences.
            settings_repo: Repository backing the secret store fallback.

        Returns:
            The best available strategy.

        Raises:
            NoAvailableEngineError: If neither backend is usable.
        """
        # Prefer cloud only when the user opted in (key present) AND we can reach
        # the network AND the backend reports healthy.
        key = self._secret_store.get_key(settings_repo)
        if key and await self._network_reachable():
            cloud = self._build_cloud(settings, key)
            if await cloud.health_check():
                return cloud

        # Fall back to the local daemon if it is up.
        local = self._build_local(settings)
        if await local.health_check():
            return local

        raise NoAvailableEngineError(
            "No AI engine is currently available.",
            hints=[
                f"Start the Ollama daemon at {settings.ollama_base_url}, or",
                "add a cloud API key in settings and ensure you are online.",
            ],
        )

    # ------------------------------------------------------------------ #
    # Builders & probes
    # ------------------------------------------------------------------ #
    def _build_local(self, settings: AppSettings) -> LocalOllamaStrategy:
        """Construct a local Ollama strategy from settings.

        Args:
            settings: Current settings.

        Returns:
            A configured :class:`LocalOllamaStrategy`.
        """
        return LocalOllamaStrategy(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            timeout_s=settings.request_timeout_s,
        )

    def _build_cloud(self, settings: AppSettings, key: str) -> CloudAnthropicStrategy:
        """Construct a cloud Anthropic strategy from settings and a key.

        Args:
            settings: Current settings.
            key: The plaintext cloud API key.

        Returns:
            A configured :class:`CloudAnthropicStrategy`.

        Raises:
            ConfigError: If no cloud model name is configured.
        """
        if not settings.cloud_model:
            raise ConfigError("Cloud provider selected but no cloud model is set.")
        return CloudAnthropicStrategy(
            api_key=key,
            model=settings.cloud_model,
            timeout_s=settings.request_timeout_s,
        )

    async def _network_reachable(self) -> bool:
        """Probe outbound connectivity to the cloud API host.

        Issues a lightweight ``HEAD`` request with a short timeout; no tokens are
        spent. Any exception is treated as "offline".

        Returns:
            ``True`` if the host responded at all.
        """
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                await client.head(_ANTHROPIC_PROBE_URL)
                return True
        except httpx.HTTPError:
            return False
