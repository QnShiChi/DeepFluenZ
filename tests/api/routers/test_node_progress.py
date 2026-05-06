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
            "active_remediation": {
                "source_node_id": "topic_search",
                "target_node_id": "topic_intro",
                "weak_concepts": ["state_space"],
                "failure_severity": "moderate",
                "status": "recommended",
                "attempt_count": 0,
                "last_node_quiz_score": 0.4,
                "last_remediation_quiz_score": None,
            },
            "review_state": {
                "nodes": {
                    "topic_intro": {
                        "last_reviewed_at": "2026-05-01T09:00:00Z",
                        "due_at": "2026-05-06T09:00:00Z",
                        "forgetting_risk": 0.8,
                        "retrievability": 0.35,
                        "review_mode": "full_node_review",
                    }
                },
                "queue": [
                    {
                        "node_id": "topic_intro",
                        "review_mode": "full_node_review",
                        "score": 0.87,
                        "due_at": "2026-05-06T09:00:00Z",
                        "reason_codes": ["needs_review_before_advance", "high_unlock_value"],
                    }
                ],
            },
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
    assert response.active_remediation is not None
    assert response.active_remediation["target_node_id"] == "topic_intro"
    assert response.review_queue[0]["node_id"] == "topic_intro"
    assert response.review_state is not None
    assert response.review_state["nodes"]["topic_intro"]["review_mode"] == "full_node_review"


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


@pytest.mark.anyio
async def test_mark_node_progress_emits_node_started_timeline_event(
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

    response = await node_progress_module.mark_node_progress(
        node_progress_module.MarkProgressRequest(
            session_id=session["session_id"],
            course_id="intro-ai",
            node_id="topic_search",
            status="explored",
        )
    )
    events = await store.get_learning_timeline("intro-ai", category="node", limit=10)
    state = await store.get_student_state(session["session_id"], "intro-ai")

    assert response.success is True
    assert events[0]["event_type"] == "node_started"
    assert events[0]["node_id"] == "topic_search"
    assert state is not None
    assert state["review_state"]["nodes"]["topic_search"]["review_mode"] == "light_recall_check"
    assert state["review_state"]["queue"][0]["node_id"] == "topic_search"


@pytest.mark.anyio
async def test_get_node_progress_returns_in_session_knowledge_state(
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
            "mastered_nodes": [],
            "explored_nodes": ["topic_search"],
            "dynamic_nodes": [],
            "active_remediation": None,
            "in_session_knowledge_state": {
                "session_id": session["session_id"],
                "course_id": "intro-ai",
                "active_node_id": "topic_search",
                "nodes": {},
                "next_step_decision": {
                    "action": "advance",
                    "target_node_id": "topic_planning",
                    "reason_tags": ["ready_to_advance"],
                    "explanation_summary": "Ban da san sang di tiep.",
                },
            },
        },
    )
    monkeypatch.setattr(node_progress_module, "get_sqlite_session_store", lambda: store)

    response = await node_progress_module.get_node_progress(
        course_id="intro-ai",
        session_id=session["session_id"],
    )

    assert response.in_session_knowledge_state is not None
    assert response.in_session_knowledge_state["active_node_id"] == "topic_search"
    assert response.next_step_decision is not None
    assert response.next_step_decision["action"] == "advance"
