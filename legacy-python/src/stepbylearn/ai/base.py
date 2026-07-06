"""The AI strategy interface (Strategy Pattern).

Every concrete driver implements this small, async, framework-free contract.
Keeping it minimal (a health check plus a single text-generation call) means new
backends can be added without touching the services that consume them.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from stepbylearn.domain.enums import AIProvider


class AIStrategy(ABC):
    """Abstract base class for an AI generation backend."""

    @property
    @abstractmethod
    def provider(self) -> AIProvider:
        """Return the provider identity this strategy represents."""
        raise NotImplementedError

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the concrete model name used for generation."""
        raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> bool:
        """Return whether this backend is currently reachable and usable.

        Implementations must be cheap and timeout-guarded; they are called
        during strategy resolution and must never raise.
        """
        raise NotImplementedError

    @abstractmethod
    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        """Generate a completion for ``prompt`` and return the raw text.

        Args:
            prompt: The user prompt to send to the model.
            system: Optional system instruction steering the model.

        Returns:
            The raw, unparsed text returned by the model. Callers are
            responsible for healing/validating any embedded JSON.
        """
        raise NotImplementedError
