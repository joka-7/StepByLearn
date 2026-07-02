"""Versioned prompt templates for syllabus generation.

The prompts embed the exact JSON schema the model must return. Centralizing them
(rather than inlining strings at call sites) makes the contract auditable and
lets the schema hint stay in lock-step with :class:`SyllabusDraft`.
"""

from __future__ import annotations

import json

from stepbylearn.domain.enums import Difficulty
from stepbylearn.domain.models import SyllabusDraft

PROMPT_VERSION = "1.0.0"

SYSTEM_INSTRUCTION = (
    "You are an expert curriculum designer. You produce concise, well-sequenced, "
    "step-by-step learning paths. You ALWAYS respond with a single valid JSON "
    "object and no surrounding prose, markdown, or code fences."
)


def _schema_hint() -> str:
    """Return a compact JSON-schema hint derived from the draft model.

    Deriving the hint from :class:`SyllabusDraft` keeps the prompt and the
    validated model from drifting apart.

    Returns:
        A pretty-printed JSON schema string.
    """
    return json.dumps(SyllabusDraft.model_json_schema(), indent=2)


def build_syllabus_prompt(topic: str, difficulty: Difficulty) -> str:
    """Build the user prompt asking the model for a structured syllabus.

    Args:
        topic: The subject the learner wants to study.
        difficulty: Target difficulty for the generated path.

    Returns:
        A fully rendered prompt string including the required JSON schema.
    """
    return (
        f"Create a step-by-step learning path for the topic: {topic!r}.\n"
        f"Target difficulty: {difficulty.value}.\n\n"
        "Requirements:\n"
        "- Between 5 and 12 ordered steps, each with a clear title and a short "
        "content description.\n"
        "- Optionally include a few high-quality resources (label + URL) per step.\n"
        "- Provide an estimated_minutes per step when reasonable.\n\n"
        "Return ONLY a JSON object matching exactly this schema:\n"
        f"{_schema_hint()}\n"
    )


def build_correction_prompt(previous_output: str, validation_errors: str) -> str:
    """Build a corrective re-prompt after a validation failure.

    Args:
        previous_output: The malformed output the model produced.
        validation_errors: The serialized validation errors to fix.

    Returns:
        A prompt instructing the model to return corrected JSON only.
    """
    return (
        "Your previous response could not be parsed into the required schema.\n\n"
        f"Previous response:\n{previous_output}\n\n"
        f"Validation errors:\n{validation_errors}\n\n"
        "Return ONLY a corrected JSON object that satisfies the schema. "
        "Do not include explanations, markdown, or code fences."
    )
