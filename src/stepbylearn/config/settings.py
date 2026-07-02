"""Runtime settings loaded from the environment (via ``pydantic-settings``).

These are *non-secret* process-level knobs (bind address, default model names,
timeouts). The cloud API key is intentionally NOT modeled here — secrets are
handled exclusively by :mod:`stepbylearn.security.secret_store`.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process configuration sourced from environment variables / ``.env``.

    All fields carry the ``SBL_`` prefix in the environment (e.g. ``SBL_PORT``).

    Attributes:
        host: Bind address for the local FastAPI server.
        port: TCP port for the local FastAPI server.
        data_dir: Optional override for the local data directory.
        ollama_base_url: Base URL of the local Ollama daemon.
        ollama_model: Default local model name (e.g. ``llama3``).
        cloud_model: Default cloud model name for the Anthropic strategy.
        request_timeout_s: Per-request timeout applied to AI backends.
    """

    model_config = SettingsConfigDict(
        env_prefix="SBL_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    cloud_model: str = "claude-sonnet-5"
    request_timeout_s: int = Field(default=120, ge=1)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a process-wide cached :class:`Settings` instance.

    Caching avoids re-parsing the environment on every access while keeping a
    single source of truth. Tests can clear the cache via
    ``get_settings.cache_clear()``.

    Returns:
        The cached settings object.
    """
    return Settings()
