"""Cloud AI backend using the Anthropic Claude API (high-fidelity generation).

Selected only when the user has supplied an API key and (in ``auto`` mode) the
network is reachable. The key is passed in at construction time by the resolver,
which fetches it from the :class:`SecretStore`; this module never reads secrets
directly.
"""

from __future__ import annotations

from anthropic import APIError, AsyncAnthropic

from stepbylearn.ai.base import AIStrategy
from stepbylearn.domain.enums import AIProvider

# Conservative cap; syllabus JSON is small, and bounding output limits latency.
_MAX_TOKENS = 4096


class CloudAnthropicStrategy(AIStrategy):
    """AI strategy backed by the Anthropic Claude API."""

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        timeout_s: int = 120,
    ) -> None:
        """Initialize the strategy.

        Args:
            api_key: The user's Anthropic API key.
            model: The Claude model identifier to use.
            timeout_s: Per-request timeout in seconds.
        """
        self._model = model
        self._client = AsyncAnthropic(api_key=api_key, timeout=float(timeout_s))

    @property
    def provider(self) -> AIProvider:
        """Return the cloud-Anthropic provider identity."""
        return AIProvider.CLOUD_ANTHROPIC

    @property
    def model_name(self) -> str:
        """Return the configured Claude model identifier."""
        return self._model

    async def health_check(self) -> bool:
        """Return whether the cloud backend appears usable.

        A key being present is a necessary precondition; the resolver separately
        probes network reachability. A full API round-trip is intentionally
        avoided here to not spend tokens during resolution.

        Returns:
            ``True`` when a non-empty API key is configured.
        """
        return bool(self._client.api_key)

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        """Generate a completion via the Anthropic Messages API.

        Args:
            prompt: The user prompt.
            system: Optional system instruction.

        Returns:
            The concatenated text of the response content blocks.

        Raises:
            anthropic.APIError: On an API-level failure.
        """
        try:
            message = await self._client.messages.create(
                model=self._model,
                max_tokens=_MAX_TOKENS,
                system=system or "",
                messages=[{"role": "user", "content": prompt}],
            )
        except APIError:
            # Re-raise unchanged; the service layer maps it to a user-facing error.
            raise

        # Concatenate text blocks; non-text blocks (if any) are ignored.
        return "".join(block.text for block in message.content if block.type == "text")
