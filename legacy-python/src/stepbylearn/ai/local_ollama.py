"""Local, free AI backend driven by an Ollama daemon (Llama3 / Mistral).

Uses the Ollama HTTP API directly via ``httpx`` so the health check and the
generation call share one timeout-guarded client and the code has no hidden
global state. This is the privacy-preserving default: nothing leaves the machine.
"""

from __future__ import annotations

import httpx

from stepbylearn.ai.base import AIStrategy
from stepbylearn.domain.enums import AIProvider


class LocalOllamaStrategy(AIStrategy):
    """AI strategy backed by a locally running Ollama daemon."""

    def __init__(
        self,
        base_url: str,
        model: str,
        *,
        timeout_s: int = 120,
    ) -> None:
        """Initialize the strategy.

        Args:
            base_url: Base URL of the Ollama daemon (e.g. ``http://localhost:11434``).
            model: The local model name to use (e.g. ``llama3``).
            timeout_s: Per-request timeout in seconds.
        """
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_s = timeout_s

    @property
    def provider(self) -> AIProvider:
        """Return the local-Ollama provider identity."""
        return AIProvider.LOCAL_OLLAMA

    @property
    def model_name(self) -> str:
        """Return the configured local model name."""
        return self._model

    async def health_check(self) -> bool:
        """Return whether the Ollama daemon is reachable.

        Uses a short timeout so a missing daemon fails fast during resolution.
        Never raises — any error is reported as "unreachable".

        Returns:
            ``True`` if the daemon responds to ``GET /api/tags``.
        """
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self._base_url}/api/tags")
                return response.status_code == httpx.codes.OK
        except httpx.HTTPError:
            return False

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        """Generate a completion via the Ollama ``/api/generate`` endpoint.

        Args:
            prompt: The user prompt.
            system: Optional system instruction.

        Returns:
            The raw ``response`` text field returned by Ollama.

        Raises:
            httpx.HTTPError: On network failure or a non-2xx response.
        """
        payload: dict[str, object] = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
            # Ask Ollama to constrain output to JSON where the model supports it;
            # the healer still runs as a safety net for models that ignore this.
            "format": "json",
        }
        if system is not None:
            payload["system"] = system

        async with httpx.AsyncClient(timeout=self._timeout_s) as client:
            response = await client.post(f"{self._base_url}/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
        return str(data.get("response", ""))
