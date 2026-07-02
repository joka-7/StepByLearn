"""FastAPI dependency helpers exposing the container to routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from stepbylearn.api.container import Container


def get_container(request: Request) -> Container:
    """Return the process container stored on the app state.

    Args:
        request: The incoming request (carries ``app.state``).

    Returns:
        The wired :class:`Container`.
    """
    container: Container = request.app.state.container
    return container


# Reusable annotated dependency for route signatures.
ContainerDep = Annotated[Container, Depends(get_container)]
