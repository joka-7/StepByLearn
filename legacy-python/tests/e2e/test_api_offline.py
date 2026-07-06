"""End-to-end API test proving the full flow works entirely offline.

The AI resolver is replaced with a fake so no network is touched; every other
layer (routing, services, repositories, SQLite) runs for real against an
in-memory database.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from tests.conftest import VALID_SYLLABUS_JSON, FakeStrategy

from stepbylearn.api.app import create_app
from stepbylearn.api.container import Container
from stepbylearn.domain.models import AppSettings


class _FakeResolver:
    def __init__(self, strategy: FakeStrategy) -> None:
        self._strategy = strategy

    async def resolve(self, _settings: AppSettings, _repo: object) -> FakeStrategy:
        return self._strategy


@pytest.fixture
def client(container: Container) -> Iterator[TestClient]:
    """Yield a TestClient whose container is the in-memory test container."""
    container.resolver = _FakeResolver(FakeStrategy(VALID_SYLLABUS_JSON))  # type: ignore[assignment]
    app = create_app(container.settings)
    with TestClient(app) as test_client:
        # Replace the lifespan-built container with the in-memory test one.
        test_client.app.state.container = container
        yield test_client


def test_full_offline_journey(client: TestClient) -> None:
    # 1. Generate a path (uses the fake strategy, no network).
    resp = client.post("/api/paths", json={"topic": "Rust", "difficulty": "beginner"})
    assert resp.status_code == 201
    path = resp.json()
    path_id = path["id"]
    assert len(path["steps"]) == 2

    # 2. Schedule it onto the calendar.
    resp = client.post(
        f"/api/paths/{path_id}/schedule",
        json={"start_date": "2026-07-01", "days_between": 1, "milestone_every": 2},
    )
    assert resp.status_code == 200
    entries = resp.json()
    assert entries[1]["is_milestone"] is True

    # 3. Mark the first step done.
    first_step_id = path["steps"][0]["id"]
    resp = client.patch(f"/api/steps/{first_step_id}/status", json={"status": "done"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"

    # 4. Progress reflects the completion.
    resp = client.get(f"/api/paths/{path_id}/progress")
    assert resp.status_code == 200
    progress = resp.json()
    assert progress["done_steps"] == 1
    assert progress["total_steps"] == 2
    assert progress["percent_complete"] == 50.0
    assert progress["next_step_id"] == path["steps"][1]["id"]

    # 5. The calendar range query returns both entries.
    resp = client.get(
        "/api/calendar", params={"start": "2026-07-01", "end": "2026-07-31"}
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_settings_key_is_write_only(client: TestClient) -> None:
    resp = client.put(
        "/api/settings",
        json={"provider_mode": "force_cloud", "cloud_api_key": "sk-secret"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_cloud_key"] is True
    # The secret must never be echoed back in any field.
    assert "sk-secret" not in resp.text
