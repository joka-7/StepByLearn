"""Integration tests for the path-generation orchestration."""

from __future__ import annotations

import pytest
from tests.conftest import VALID_SYLLABUS_JSON, FakeStrategy

from stepbylearn.domain.enums import Difficulty
from stepbylearn.domain.exceptions import JSONHealingError
from stepbylearn.domain.models import AppSettings
from stepbylearn.services.path_generation import PathGenerationService


class _FakeResolver:
    """Resolver stub that always returns a preconfigured strategy."""

    def __init__(self, strategy: FakeStrategy) -> None:
        self._strategy = strategy

    async def resolve(self, _settings: AppSettings, _repo: object) -> FakeStrategy:
        return self._strategy


@pytest.mark.asyncio
async def test_generate_persists_path_and_steps(make_uow) -> None:
    strategy = FakeStrategy(VALID_SYLLABUS_JSON)
    with make_uow() as uow:
        service = PathGenerationService(uow, _FakeResolver(strategy))  # type: ignore[arg-type]
        path = await service.generate_path("X", Difficulty.BEGINNER)

    with make_uow() as uow:
        loaded = uow.paths.get(path.id)
    assert loaded is not None
    assert len(loaded.steps) == 2
    # order_index is assigned by the service, dense and zero-based.
    assert [s.order_index for s in loaded.steps] == [0, 1]


@pytest.mark.asyncio
async def test_dirty_json_is_healed(make_uow) -> None:
    dirty = f"Here you go:\n```json\n{VALID_SYLLABUS_JSON}\n```"
    strategy = FakeStrategy(dirty)
    with make_uow() as uow:
        service = PathGenerationService(uow, _FakeResolver(strategy))  # type: ignore[arg-type]
        path = await service.generate_path("X", Difficulty.BEGINNER)
    assert path.title == "Learn X"


@pytest.mark.asyncio
async def test_correction_reprompt_then_success(make_uow) -> None:
    class TwoShotStrategy(FakeStrategy):
        """Returns junk first, valid JSON on the corrective re-prompt."""

        def __init__(self) -> None:
            super().__init__("")
            self._shots = ["not json at all", VALID_SYLLABUS_JSON]

        async def generate(self, prompt: str, *, system: str | None = None) -> str:
            self.calls.append(prompt)
            return self._shots[min(len(self.calls) - 1, 1)]

    strategy = TwoShotStrategy()
    with make_uow() as uow:
        service = PathGenerationService(uow, _FakeResolver(strategy))  # type: ignore[arg-type]
        path = await service.generate_path("X", Difficulty.BEGINNER)
    assert len(strategy.calls) == 2  # original + one correction
    assert path.title == "Learn X"


@pytest.mark.asyncio
async def test_persistent_bad_output_raises(make_uow) -> None:
    strategy = FakeStrategy("never valid json")
    with make_uow() as uow:
        service = PathGenerationService(uow, _FakeResolver(strategy))  # type: ignore[arg-type]
        with pytest.raises(JSONHealingError):
            await service.generate_path("X", Difficulty.BEGINNER)
