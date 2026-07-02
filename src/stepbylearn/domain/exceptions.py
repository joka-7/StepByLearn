"""Domain-specific exception hierarchy.

A single root (:class:`StepByLearnError`) lets the API layer catch and translate
all business failures into clean HTTP responses while keeping messages
actionable for the end user.
"""

from __future__ import annotations


class StepByLearnError(Exception):
    """Base class for every StepByLearn domain error."""


class ConfigError(StepByLearnError):
    """Raised when configuration or preferences are invalid or incomplete.

    Example: forcing the cloud provider without a stored API key.
    """


class NoAvailableEngineError(StepByLearnError):
    """Raised when no AI backend can be resolved for a generation request.

    Carries actionable hints (e.g. "start Ollama" or "add an API key") that the
    API surfaces to the user.
    """

    def __init__(self, message: str, hints: list[str] | None = None) -> None:
        """Initialize the error.

        Args:
            message: Human-readable summary of the failure.
            hints: Optional list of concrete remediation steps.
        """
        super().__init__(message)
        self.hints: list[str] = hints or []


class JSONHealingError(StepByLearnError):
    """Raised when fragile LLM output cannot be coerced into a valid model.

    Retains the last raw output and the underlying validation errors so the
    failure can be diagnosed without re-running the (possibly costly) model.
    """

    def __init__(
        self,
        message: str,
        raw_output: str,
        validation_errors: str | None = None,
    ) -> None:
        """Initialize the error.

        Args:
            message: Human-readable summary of the failure.
            raw_output: The last raw string returned by the model.
            validation_errors: Serialized validation error detail, if any.
        """
        super().__init__(message)
        self.raw_output: str = raw_output
        self.validation_errors: str | None = validation_errors


class RepositoryError(StepByLearnError):
    """Raised for data-access failures not caused by user input.

    Example: a requested aggregate root does not exist, or a unique constraint
    is violated by a programming error.
    """
