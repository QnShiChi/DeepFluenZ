import importlib
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from deeptutor.services.session.sqlite_store import get_sqlite_session_store
from deeptutor.services.session.sqlite_store import SQLiteSessionStore

graph_recommendation_module = importlib.import_module("deeptutor.api.routers.graph_recommendation")


@pytest.fixture
def store(tmp_path: Path) -> SQLiteSessionStore:
    return SQLiteSessionStore(db_path=tmp_path / "graph-recommendation.db")


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(graph_recommendation_module.router, prefix="/api/v1")
    return app


@pytest.mark.anyio
async def test_get_graph_recommendation_returns_next_node(store: SQLiteSessionStore) -> None:
    session = await store.create_session(title="Graph recommendation session")
    await store.upsert_course_template(
        "intro-ai",
        json.dumps(
            {
                "course_id": "intro-ai",
                "title": "Intro to AI",
                "source_type": "manual_json",
                "nodes": [
                    {"node_id": "topic_intro", "title": "Intro", "node_type": "topic"},
                    {"node_id": "topic_search", "title": "Search", "node_type": "topic"},
                ],
                "edges": [
                    {
                        "edge_id": "edge_intro_search",
                        "source": "topic_intro",
                        "target": "topic_search",
                        "relation_type": "prerequisite",
                        "confidence": 1.0,
                        "rationale": "",
                        "source_refs": [],
                    }
                ],
                "audit": {
                    "backbone_node_ids": ["topic_intro", "topic_search"],
                    "enriched_node_ids": [],
                    "backbone_edge_ids": ["edge_intro_search"],
                    "enriched_edge_ids": [],
                    "warnings": [],
                },
            }
        ),
    )
    await store.upsert_student_state(
        session["session_id"],
        "intro-ai",
        {
            "current_node_id": "topic_intro",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": [],
            "dynamic_nodes": [],
        },
    )

    response = await graph_recommendation_module.get_graph_recommendation(
        course_id="intro-ai",
        session_id=session["session_id"],
        store=store,
    )

    assert response.recommended_node_id == "topic_search"
    assert response.mode == "advance"


@pytest.mark.anyio
async def test_graph_recommendation_returns_blocked_state_when_gate_is_blocked(
    store: SQLiteSessionStore,
) -> None:
    session = await store.create_session(title="Graph recommendation session")
    await store.upsert_course_template(
        "intro-ai",
        json.dumps(
            {
                "course_id": "intro-ai",
                "title": "Intro to AI",
                "source_type": "manual_json",
                "nodes": [
                    {"node_id": "topic_intro", "title": "Intro", "node_type": "topic"},
                    {"node_id": "topic_search", "title": "Search", "node_type": "topic"},
                ],
                "edges": [],
                "audit": {
                    "backbone_node_ids": ["topic_intro", "topic_search"],
                    "enriched_node_ids": [],
                    "backbone_edge_ids": [],
                    "enriched_edge_ids": [],
                    "warnings": [],
                },
            }
        ),
    )
    await store.save_graph_adaptive_gate(
        "intro-ai",
        {
            "status": "adaptive_blocked",
            "blocking_issue_ids": ["issue_cycle"],
        },
    )

    app = _build_app()
    app.dependency_overrides[get_sqlite_session_store] = lambda: store
    with TestClient(app) as client:
        response = client.get(
            f"/api/v1/graph/recommendation/intro-ai?session_id={session['session_id']}",
        )
        assert response.status_code == 200
        payload = response.json()

    assert payload["recommended_node_id"] == ""
    assert payload["mode"] == "review"
    assert payload["score"] == 0.0
    assert payload["reason_codes"] == ["needs_review_before_advance"]
    assert payload["backup_node_ids"] == []
