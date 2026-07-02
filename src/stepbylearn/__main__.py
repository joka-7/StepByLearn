"""Console entrypoint: launch the local FastAPI server.

Run with ``python -m stepbylearn`` or the ``stepbylearn`` console script. The
server binds to a loopback address by default so the app stays local-only.
"""

from __future__ import annotations

import uvicorn

from stepbylearn.api.app import create_app
from stepbylearn.config import get_settings


def main() -> None:
    """Start the Uvicorn server bound to the configured host and port."""
    settings = get_settings()
    app = create_app(settings)
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
