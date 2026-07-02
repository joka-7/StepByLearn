"""AI layer: the Strategy Pattern for hybrid local/cloud generation.

The :class:`AIStrategy` interface abstracts *how* text is generated; concrete
drivers (:class:`LocalOllamaStrategy`, :class:`CloudAnthropicStrategy`) implement
it. :class:`StrategyResolver` selects a driver at runtime, and
:func:`heal_and_validate` turns fragile model output into trusted domain models.
"""

from stepbylearn.ai.base import AIStrategy
from stepbylearn.ai.cloud_anthropic import CloudAnthropicStrategy
from stepbylearn.ai.json_healer import heal_and_validate
from stepbylearn.ai.local_ollama import LocalOllamaStrategy
from stepbylearn.ai.resolver import StrategyResolver

__all__ = [
    "AIStrategy",
    "CloudAnthropicStrategy",
    "LocalOllamaStrategy",
    "StrategyResolver",
    "heal_and_validate",
]
