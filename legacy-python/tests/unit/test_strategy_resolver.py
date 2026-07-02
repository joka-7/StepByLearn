"""Tests for runtime AI strategy resolution."""

from __future__ import annotations

import pytest

from stepbylearn.ai.cloud_anthropic import CloudAnthropicStrategy
from stepbylearn.ai.local_ollama import LocalOllamaStrategy
from stepbylearn.ai.resolver import StrategyResolver
from stepbylearn.domain.enums import ProviderMode
from stepbylearn.domain.exceptions import ConfigError, NoAvailableEngineError
from stepbylearn.domain.models import AppSettings
from stepbylearn.security.secret_store import SecretStore

# A base URL on a closed port so the local health check deterministically fails.
_DEAD_OLLAMA = "http://127.0.0.1:1"


@pytest.mark.asyncio
async def test_force_local_returns_ollama(secret_store: SecretStore, make_uow) -> None:
    resolver = StrategyResolver(secret_store)
    settings = AppSettings(provider_mode=ProviderMode.FORCE_LOCAL)
    with make_uow() as uow:
        strategy = await resolver.resolve(settings, uow.settings)
    assert isinstance(strategy, LocalOllamaStrategy)


@pytest.mark.asyncio
async def test_force_cloud_without_key_raises(
    secret_store: SecretStore, make_uow
) -> None:
    resolver = StrategyResolver(secret_store)
    settings = AppSettings(
        provider_mode=ProviderMode.FORCE_CLOUD, cloud_model="claude-x"
    )
    with make_uow() as uow, pytest.raises(ConfigError):
        await resolver.resolve(settings, uow.settings)


@pytest.mark.asyncio
async def test_force_cloud_with_key_returns_cloud(
    secret_store: SecretStore, make_uow
) -> None:
    resolver = StrategyResolver(secret_store)
    settings = AppSettings(
        provider_mode=ProviderMode.FORCE_CLOUD, cloud_model="claude-x"
    )
    with make_uow() as uow:
        secret_store.set_key("sk-test", uow.settings)
        strategy = await resolver.resolve(settings, uow.settings)
    assert isinstance(strategy, CloudAnthropicStrategy)


@pytest.mark.asyncio
async def test_auto_with_no_key_and_dead_local_raises(
    secret_store: SecretStore, make_uow
) -> None:
    resolver = StrategyResolver(secret_store)
    settings = AppSettings(
        provider_mode=ProviderMode.AUTO, ollama_base_url=_DEAD_OLLAMA
    )
    with make_uow() as uow, pytest.raises(NoAvailableEngineError) as exc_info:
        await resolver.resolve(settings, uow.settings)
    assert exc_info.value.hints  # actionable hints are provided
