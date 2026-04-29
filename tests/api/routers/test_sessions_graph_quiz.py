from __future__ import annotations

import asyncio
import importlib
import json
from pathlib import Path

import pytest

from deeptutor.services.session.sqlite_store import SQLiteSessionStore

sessions_module = importlib.import_module("deeptutor.api.routers.sessions")


@pytest.fixture
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SQLiteSessionStore:
    instance = SQLiteSessionStore(db_path=tmp_path / "sessions-graph-quiz.db")
    monkeypatch.setattr(sessions_module, "get_sqlite_session_store", lambda: instance)
    return instance


def _seed_course(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.upsert_course_template(
            "intro-ai",
            json.dumps(
                {
                    "course_id": "intro-ai",
                    "title": "Intro to AI",
                    "source_type": "manual_json",
                    "nodes": [
                        {"node_id": "topic_search", "title": "Search", "node_type": "topic"},
                    ],
                    "edges": [],
                    "audit": {
                        "backbone_node_ids": ["topic_search"],
                        "enriched_node_ids": [],
                        "backbone_edge_ids": [],
                        "enriched_edge_ids": [],
                        "warnings": [],
                    },
                }
            ),
        )
    )


def _graph_quiz_answers(correct_pattern: list[bool]) -> list[dict[str, object]]:
    answers: list[dict[str, object]] = []
    for idx, is_correct in enumerate(correct_pattern, start=1):
        answers.append(
            {
                "question_id": f"q{idx}",
                "question": f"Q{idx}?",
                "question_type": "choice",
                "options": {"A": "A", "B": "B"},
                "user_answer": "B" if is_correct else "A",
                "correct_answer": "B",
                "difficulty": "easy",
                "is_correct": is_correct,
            }
        )
    return answers


def test_submit_graph_quiz_failure_creates_active_remediation(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Quiz Session"))
    _seed_course(store)
    payload = sessions_module.QuizResultsRequest.model_validate(
        {
            "answers": _graph_quiz_answers([False, True, False]),
            "graph_context": {
                "course_id": "intro-ai",
                "node_id": "topic_search",
                "quiz_kind": "node_quiz",
                "node_difficulty": "easy",
                "question_concept_map": {
                    "q1": ["state_space"],
                    "q2": ["state_space"],
                    "q3": ["search_tree"],
                },
            },
        }
    )

    response = asyncio.run(sessions_module.record_quiz_results(session["id"], payload))

    assert response["recorded"] is True
    state = asyncio.run(store.get_student_state(session["id"], "intro-ai"))
    assert state is not None
    assert state["active_remediation"]["source_node_id"] == "topic_search"
    assert state["active_remediation"]["status"] == "recommended"
    assert sorted(state["active_remediation"]["weak_concepts"]) == ["search_tree", "state_space"]


def test_submit_graph_quiz_success_clears_completed_remediation(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Quiz Session"))
    _seed_course(store)
    asyncio.run(
        store.upsert_student_state(
            session["id"],
            "intro-ai",
            {
                "current_node_id": "topic_search",
                "mastered_nodes": [],
                "explored_nodes": ["topic_search"],
                "weak_node_ids": ["topic_search"],
                "dynamic_nodes": [],
                "active_remediation": {
                    "source_node_id": "topic_search",
                    "target_node_id": "topic_intro",
                    "weak_concepts": ["state_space"],
                    "failure_severity": "moderate",
                    "status": "passed_mini_quiz",
                    "attempt_count": 0,
                    "last_node_quiz_score": 0.4,
                    "last_remediation_quiz_score": 1.0,
                },
                "remediation_cache": {},
            },
        )
    )
    payload = sessions_module.QuizResultsRequest.model_validate(
        {
            "answers": _graph_quiz_answers([True, True, True]),
            "graph_context": {
                "course_id": "intro-ai",
                "node_id": "topic_search",
                "quiz_kind": "node_quiz",
                "node_difficulty": "easy",
                "question_concept_map": {"q1": ["state_space"]},
            },
        }
    )

    response = asyncio.run(sessions_module.record_quiz_results(session["id"], payload))

    assert response["recorded"] is True
    state = asyncio.run(store.get_student_state(session["id"], "intro-ai"))
    assert state is not None
    assert state["active_remediation"] is None
    assert "topic_search" in state["mastered_nodes"]


def test_submit_remediation_quiz_success_marks_passed_mini_quiz(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Quiz Session"))
    _seed_course(store)
    asyncio.run(
        store.upsert_student_state(
            session["id"],
            "intro-ai",
            {
                "current_node_id": "topic_search",
                "mastered_nodes": ["topic_intro"],
                "explored_nodes": ["topic_search"],
                "weak_node_ids": ["topic_search"],
                "dynamic_nodes": [],
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
                "remediation_cache": {},
            },
        )
    )
    payload = sessions_module.QuizResultsRequest.model_validate(
        {
            "answers": _graph_quiz_answers([True, True]),
            "graph_context": {
                "course_id": "intro-ai",
                "node_id": "topic_search",
                "target_node_id": "topic_intro",
                "quiz_kind": "remediation_quiz",
                "node_difficulty": "easy",
                "weak_concepts": ["state_space"],
            },
        }
    )

    response = asyncio.run(sessions_module.record_quiz_results(session["id"], payload))

    assert response["recorded"] is True
    state = asyncio.run(store.get_student_state(session["id"], "intro-ai"))
    assert state is not None
    assert state["active_remediation"]["status"] == "passed_mini_quiz"
    assert "topic_search" not in state["mastered_nodes"]


def test_submit_remediation_quiz_failure_increments_attempt_count(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Quiz Session"))
    _seed_course(store)
    asyncio.run(
        store.upsert_student_state(
            session["id"],
            "intro-ai",
            {
                "current_node_id": "topic_search",
                "mastered_nodes": ["topic_intro"],
                "explored_nodes": ["topic_search"],
                "weak_node_ids": ["topic_search"],
                "dynamic_nodes": [],
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
                "remediation_cache": {},
            },
        )
    )
    payload = sessions_module.QuizResultsRequest.model_validate(
        {
            "answers": _graph_quiz_answers([False, False]),
            "graph_context": {
                "course_id": "intro-ai",
                "node_id": "topic_search",
                "target_node_id": "topic_intro",
                "quiz_kind": "remediation_quiz",
                "node_difficulty": "easy",
                "weak_concepts": ["state_space"],
            },
        }
    )

    response = asyncio.run(sessions_module.record_quiz_results(session["id"], payload))

    assert response["recorded"] is True
    state = asyncio.run(store.get_student_state(session["id"], "intro-ai"))
    assert state is not None
    assert state["active_remediation"]["status"] == "recommended"
    assert state["active_remediation"]["attempt_count"] == 1
    assert state["active_remediation"]["last_remediation_quiz_score"] == 0.0
