import importlib
import json
from pathlib import Path

import pytest

from deeptutor.services.session.sqlite_store import SQLiteSessionStore

node_progress_module = importlib.import_module("deeptutor.api.routers.node_progress")


@pytest.fixture
def store(tmp_path: Path) -> SQLiteSessionStore:
    return SQLiteSessionStore(db_path=tmp_path / "node-progress.db")


@pytest.mark.anyio
async def test_get_node_progress_returns_current_node_and_dynamic_nodes(
    store: SQLiteSessionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = await store.create_session(title="Node progress session")
    await store.upsert_course_template(
        "intro-ai",
        json.dumps(
            {
                "course_id": "intro-ai",
                "title": "Intro to AI",
                "source_type": "manual_json",
                "nodes": [],
                "edges": [],
                "audit": {
                    "backbone_node_ids": [],
                    "enriched_node_ids": [],
                    "backbone_edge_ids": [],
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
            "current_node_id": "topic_search",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": ["topic_search"],
            "dynamic_nodes": [
                {
                    "node_id": "sq_review_intro",
                    "title": "Review Intro",
                    "node_type": "SIDE_QUEST",
                    "dependencies": ["topic_intro"],
                }
            ],
        },
    )
    monkeypatch.setattr(node_progress_module, "get_sqlite_session_store", lambda: store)

    response = await node_progress_module.get_node_progress(
        course_id="intro-ai",
        session_id=session["session_id"],
    )

    assert response.current_node_id == "topic_search"
    assert response.progress == {
        "topic_intro": "mastered",
        "topic_search": "explored",
    }
    assert response.dynamic_nodes[0]["node_id"] == "sq_review_intro"


@pytest.mark.anyio
async def test_set_current_node_updates_student_state(
    store: SQLiteSessionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = await store.create_session(title="Node progress session")
    await store.upsert_course_template(
        "intro-ai",
        json.dumps(
            {
                "course_id": "intro-ai",
                "title": "Intro to AI",
                "source_type": "manual_json",
                "nodes": [],
                "edges": [],
                "audit": {
                    "backbone_node_ids": [],
                    "enriched_node_ids": [],
                    "backbone_edge_ids": [],
                    "enriched_edge_ids": [],
                    "warnings": [],
                },
            }
        ),
    )
    monkeypatch.setattr(node_progress_module, "get_sqlite_session_store", lambda: store)

    response = await node_progress_module.set_current_node(
        node_progress_module.SetCurrentNodeRequest(
            session_id=session["session_id"],
            course_id="intro-ai",
            node_id="topic_search",
        )
    )
    state = await store.get_student_state(session["session_id"], "intro-ai")

    assert response.success is True
    assert state is not None
    assert state["current_node_id"] == "topic_search"
