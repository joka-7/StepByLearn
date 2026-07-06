"""Path generation use-case: resolve strategy -> generate -> heal -> persist.

This is the orchestration seam that ties the AI layer to the repository layer.
It owns the bounded corrective re-prompt loop (kept out of the pure healer) and
guarantees the resulting path plus all its steps are written in a single
transaction.
"""

from __future__ import annotations

from stepbylearn.ai import heal_and_validate
from stepbylearn.ai.base import AIStrategy
from stepbylearn.ai.prompts import (
    SYSTEM_INSTRUCTION,
    build_correction_prompt,
    build_syllabus_prompt,
)
from stepbylearn.ai.resolver import StrategyResolver
from stepbylearn.domain.enums import AIProvider, Difficulty
from stepbylearn.domain.exceptions import JSONHealingError
from stepbylearn.domain.models import (
    LearningPath,
    PathStep,
    SyllabusDraft,
)
from stepbylearn.repositories.unit_of_work import UnitOfWork

# Number of corrective re-prompts after the first failed validation attempt.
_MAX_CORRECTIONS = 1


class PathGenerationService:
    """Generates and persists learning paths using the resolved AI strategy."""

    def __init__(self, uow: UnitOfWork, resolver: StrategyResolver) -> None:
        """Initialize the service.

        Args:
            uow: The active unit of work (transaction + repositories).
            resolver: Resolver that selects the AI strategy at runtime.
        """
        self._uow = uow
        self._resolver = resolver

    async def generate_path(self, topic: str, difficulty: Difficulty) -> LearningPath:
        """Generate a learning path for ``topic`` and persist it atomically.

        Args:
            topic: The subject to build a path for.
            difficulty: Target difficulty.

        Returns:
            The persisted :class:`LearningPath` (with steps).

        Raises:
            JSONHealingError: If the model output cannot be validated after the
                bounded corrective re-prompt attempts.
            NoAvailableEngineError: If no AI backend can be resolved.
            ConfigError: If provider configuration is invalid.
        """
        settings = self._uow.settings.get()
        strategy = await self._resolver.resolve(settings, self._uow.settings)

        draft = await self._generate_validated_syllabus(strategy, topic, difficulty)

        path = self._draft_to_path(
            draft, provider=strategy.provider, model_name=strategy.model_name
        )
        # Single atomic write for the path and every step (all-or-nothing).
        self._uow.paths.add(path, syllabus_json=draft.model_dump_json())
        self._uow.commit()
        return path

    async def _generate_validated_syllabus(
        self,
        strategy: AIStrategy,
        topic: str,
        difficulty: Difficulty,
    ) -> SyllabusDraft:
        """Call the model and heal its output, re-prompting on validation failure.

        Args:
            strategy: The resolved AI strategy.
            topic: The subject to build a path for.
            difficulty: Target difficulty.

        Returns:
            A validated :class:`SyllabusDraft`.

        Raises:
            JSONHealingError: If validation still fails after all corrections.
        """
        prompt = build_syllabus_prompt(topic, difficulty)
        raw = await strategy.generate(prompt, system=SYSTEM_INSTRUCTION)

        last_error: JSONHealingError | None = None
        for _ in range(_MAX_CORRECTIONS + 1):
            try:
                return heal_and_validate(raw, SyllabusDraft)
            except JSONHealingError as exc:
                # Feed the validation detail back to the same strategy so it can
                # self-correct. Bounded to avoid unbounded latency/cost.
                last_error = exc
                correction = build_correction_prompt(
                    exc.raw_output, exc.validation_errors or str(exc)
                )
                raw = await strategy.generate(correction, system=SYSTEM_INSTRUCTION)

        # Exhausted attempts — surface the last failure with its context intact.
        assert last_error is not None  # noqa: S101 - loop runs at least once
        raise last_error

    def _draft_to_path(
        self,
        draft: SyllabusDraft,
        *,
        provider: AIProvider,
        model_name: str,
    ) -> LearningPath:
        """Convert a validated syllabus draft into a persistable path aggregate.

        Args:
            draft: The validated syllabus draft.
            provider: The provider that produced the draft (provenance).
            model_name: The concrete model name (provenance).

        Returns:
            A :class:`LearningPath` with ordered :class:`PathStep` children.
        """
        path = LearningPath(
            title=draft.title,
            topic=draft.topic,
            description=draft.description,
            difficulty=draft.difficulty,
            estimated_hours=draft.estimated_hours,
            generated_by=provider,
            model_name=model_name,
        )
        # order_index is assigned here (not trusted from the LLM) so ordering is
        # always dense and zero-based regardless of model behavior.
        path.steps = [
            PathStep(
                path_id=path.id,
                order_index=index,
                title=step.title,
                content=step.content,
                resources=step.resources,
                estimated_minutes=step.estimated_minutes,
            )
            for index, step in enumerate(draft.steps)
        ]
        return path
