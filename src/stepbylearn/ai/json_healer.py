"""Coerce fragile LLM output into validated Pydantic domain models.

Local models (Llama3 / Mistral) frequently wrap JSON in prose or code fences,
emit trailing commas, single quotes, or unquoted keys, or truncate the tail.
This module applies a defense-in-depth pipeline:

1. Strip markdown code fences and leading prose.
2. Extract the first balanced ``{...}`` / ``[...]`` span with a *string-aware*
   bracket-depth scan (so braces inside string values do not confuse it).
3. Fast path: attempt a strict ``json.loads`` (lossless when the model behaved).
4. Repair path: hand the span to :mod:`json_repair` for tolerant parsing.
5. Validate the parsed object against the target Pydantic model.

The pipeline is intentionally free of any model/network calls so it is fully
deterministic and easy to fuzz. The corrective re-prompt loop lives one layer
up, in the path-generation service.
"""

from __future__ import annotations

import json

import json_repair
from pydantic import BaseModel, ValidationError

from stepbylearn.domain.exceptions import JSONHealingError

# Opening -> matching closing bracket, for span extraction.
_CLOSERS = {"{": "}", "[": "]"}


def _strip_code_fences(text: str) -> str:
    """Remove surrounding markdown code fences if present.

    Handles ```` ```json ```` and bare ```` ``` ```` fences. Non-fenced text is
    returned unchanged.

    Args:
        text: Raw model output.

    Returns:
        The text with a single wrapping fence removed, stripped of whitespace.
    """
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped

    # Drop the opening fence line (``` or ```json) and the trailing fence.
    lines = stripped.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def extract_json_span(text: str) -> str:
    """Extract the first balanced JSON object/array span from ``text``.

    A depth counter tracks nested brackets while a small state machine ignores
    brackets that appear *inside* string literals (respecting backslash escapes).
    This isolates the JSON payload from any chatter the model added around it.

    Args:
        text: Text that contains a JSON object or array somewhere within it.

    Returns:
        The substring spanning the first complete top-level bracket pair.

    Raises:
        JSONHealingError: If no opening bracket exists or the span never closes.
    """
    start = _first_bracket_index(text)
    if start is None:
        raise JSONHealingError(
            "No JSON object or array found in model output.", raw_output=text
        )

    opener = text[start]
    closer = _CLOSERS[opener]
    depth = 0
    in_string = False
    escaped = False

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            # Inside a string, only an unescaped quote can end it; a backslash
            # escapes exactly the next character.
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == opener:
            depth += 1
        elif char == closer:
            depth -= 1
            if depth == 0:
                return text[start : index + 1]

    raise JSONHealingError(
        "Unbalanced JSON: opening bracket never closed.", raw_output=text
    )


def _first_bracket_index(text: str) -> int | None:
    """Return the index of the first ``{`` or ``[`` in ``text``.

    Args:
        text: The text to scan.

    Returns:
        The index of the first opening bracket, or ``None`` if there is none.
    """
    candidates = [text.find(bracket) for bracket in _CLOSERS]
    positions = [pos for pos in candidates if pos != -1]
    return min(positions) if positions else None


def _parse_lenient(span: str) -> object:
    """Parse ``span`` strictly first, then via tolerant repair on failure.

    Args:
        span: An extracted JSON-looking substring.

    Returns:
        The parsed Python object.

    Raises:
        JSONHealingError: If even the tolerant parser cannot produce a value.
    """
    try:
        # Fast, lossless path for well-formed output.
        return json.loads(span)
    except json.JSONDecodeError:
        # Tolerant path: fixes trailing commas, single quotes, unquoted keys,
        # and truncated tails. Returns "" on total failure, which we reject.
        repaired = json_repair.repair_json(span, return_objects=True)
        if repaired == "" or repaired is None:
            raise JSONHealingError(
                "Model output could not be repaired into valid JSON.",
                raw_output=span,
            ) from None
        return repaired


def heal_and_validate[ModelT: BaseModel](raw: str, model_type: type[ModelT]) -> ModelT:
    """Clean fragile model output and validate it against ``model_type``.

    Args:
        raw: The raw string returned by an :class:`AIStrategy`.
        model_type: The target Pydantic model class to validate into.

    Returns:
        A validated instance of ``model_type``.

    Raises:
        JSONHealingError: If the output cannot be parsed or fails validation.
            The error carries the raw output and (when relevant) the validation
            error detail so the caller can issue a corrective re-prompt.
    """
    defenced = _strip_code_fences(raw)
    span = extract_json_span(defenced)
    parsed = _parse_lenient(span)

    try:
        return model_type.model_validate(parsed)
    except ValidationError as exc:
        raise JSONHealingError(
            f"Model output did not satisfy {model_type.__name__}.",
            raw_output=raw,
            validation_errors=str(exc),
        ) from exc
