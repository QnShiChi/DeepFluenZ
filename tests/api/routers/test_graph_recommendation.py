import importlib
import json
from pathlib import Path

import pytest

from deeptutor.services.session.sqlite_store import SQLiteSessionStore

graph_recommendation_module = importlib.import_module("deeptutor.api.routers.graph_recommendation")


@pytest.fixture
def store(tmp_path: Path) -> SQLiteSessionStore:
    return SQLiteSessionStore(db_path=tmp_path / "graph-recommendation.db")


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

    response = await graph_recommendation_module.get_graph_recommendation(
        course_id="intro-ai",
        session_id=session["session_id"],
        store=store,
    )

    assert response.recommended_node_id == ""
    assert response.mode == "review"
    assert response.score == 0.0
    assert response.reason_codes == ["needs_review_before_advance"]
    assert response.backup_node_ids == []
