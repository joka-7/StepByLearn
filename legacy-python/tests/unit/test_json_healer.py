"""Tests for the fragile-JSON healing pipeline (the highest-risk component)."""

from __future__ import annotations

import json

import pytest
from hypothesis import given
from hypothesis import strategies as st

from stepbylearn.ai.json_healer import extract_json_span, heal_and_validate
from stepbylearn.domain.exceptions import JSONHealingError
from stepbylearn.domain.models import SyllabusDraft

_MINIMAL = '{"title": "T", "topic": "X", "steps": [{"title": "s1"}]}'


def test_clean_json_passes_fast_path() -> None:
    draft = heal_and_validate(_MINIMAL, SyllabusDraft)
    assert draft.title == "T"
    assert len(draft.steps) == 1


def test_strips_json_code_fence() -> None:
    raw = f"```json\n{_MINIMAL}\n```"
    draft = heal_and_validate(raw, SyllabusDraft)
    assert draft.topic == "X"


def test_strips_bare_code_fence_and_prose() -> None:
    raw = f"Sure! Here you go:\n```\n{_MINIMAL}\n```\nHope that helps."
    draft = heal_and_validate(raw, SyllabusDraft)
    assert draft.title == "T"


def test_repairs_trailing_comma() -> None:
    raw = '{"title": "T", "topic": "X", "steps": [{"title": "s1"},],}'
    draft = heal_and_validate(raw, SyllabusDraft)
    assert len(draft.steps) == 1


def test_repairs_single_quotes() -> None:
    raw = "{'title': 'T', 'topic': 'X', 'steps': [{'title': 's1'}]}"
    draft = heal_and_validate(raw, SyllabusDraft)
    assert draft.title == "T"


def test_ignores_braces_inside_strings() -> None:
    raw = '{"title": "a {nested} brace", "topic": "X", "steps": [{"title": "s"}]}'
    span = extract_json_span(raw)
    assert json.loads(span)["title"] == "a {nested} brace"


def test_extracts_object_amid_chatter() -> None:
    raw = f"blah blah {_MINIMAL} trailing text"
    span = extract_json_span(raw)
    assert json.loads(span)["topic"] == "X"


def test_no_json_raises() -> None:
    with pytest.raises(JSONHealingError):
        heal_and_validate("there is no json here", SyllabusDraft)


def test_unbalanced_json_raises() -> None:
    with pytest.raises(JSONHealingError):
        extract_json_span('{"title": "T", "steps": [')


def test_validation_failure_carries_errors() -> None:
    # Missing the required non-empty steps list.
    raw = '{"title": "T", "topic": "X", "steps": []}'
    with pytest.raises(JSONHealingError) as exc_info:
        heal_and_validate(raw, SyllabusDraft)
    assert exc_info.value.validation_errors is not None


@given(prefix=st.text(), suffix=st.text())
def test_fuzz_surrounding_text_never_crashes(prefix: str, suffix: str) -> None:
    """Arbitrary surrounding text must yield a model or a typed error, never a crash."""
    raw = f"{prefix}{_MINIMAL}{suffix}"
    try:
        draft = heal_and_validate(raw, SyllabusDraft)
        assert draft.title == "T"
    except JSONHealingError:
        # Acceptable: a stray brace in the fuzzed text can shift span extraction.
        pass
