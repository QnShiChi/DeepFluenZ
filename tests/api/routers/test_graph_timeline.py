import importlib
from pathlib import Path

import pytest

from deeptutor.services.session.sqlite_store import SQLiteSessionStore

graph_timeline_module = importlib.import_module("deeptutor.api.routers.graph_timeline")


@pytest.fixture
def store(tmp_path: Path) -> SQLiteSessionStore:
    return SQLiteSessionStore(db_path=tmp_path / "graph-timeline.db")


@pytest.mark.anyio
async def test_graph_timeline_route_returns_reverse_chronological_events(
    store: SQLiteSessionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = await store.create_session(title="Timeline session")
    await store.upsert_course_template(
        "oop_course",
        '{"course_id":"oop_course","title":"OOP","source_type":"manual_json","nodes":[],"edges":[],"audit":{"backbone_node_ids":[],"enriched_node_ids":[],"backbone_edge_ids":[],"enriched_edge_ids":[],"warnings":[]}}',
    )
    await store.append_learning_timeline_event(
        {
            "event_id": "evt_1",
            "session_id": session["id"],
            "course_id": "oop_course",
            "node_id": "oop_intro",
            "category": "quiz",
            "event_type": "quiz_failed",
            "created_at": "2026-04-29T09:00:00Z",
            "summary": "Quiz failed",
            "reason_tags": [],
            "details": {},
            "actions": [],
            "highlighted": False,
        }
    )
    await store.append_learning_timeline_event(
        {
            "event_id": "evt_2",
            "session_id": session["id"],
            "course_id": "oop_course",
            "node_id": "oop_intro",
            "category": "remediation",
            "event_type": "remediation_started",
            "created_at": "2026-04-29T09:05:00Z",
            "summary": "Remediation started",
            "reason_tags": [],
            "details": {},
            "actions": [],
            "highlighted": True,
        }
    )
    monkeypatch.setattr(graph_timeline_module, "get_sqlite_session_store", lambda: store)

    payload = await graph_timeline_module.get_graph_timeline(
        "oop_course",
        category="",
        node_id="",
        limit=50,
    )

    assert payload["course_id"] == "oop_course"
    assert payload["events"][0]["event_id"] == "evt_2"
    assert payload["events"][1]["event_id"] == "evt_1"
