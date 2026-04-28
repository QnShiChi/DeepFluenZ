from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path

import pytest

from deeptutor.services.path_service import PathService
from deeptutor.services.session.sqlite_store import SQLiteSessionStore


def test_sqlite_store_defaults_to_data_user_chat_history_db(tmp_path: Path) -> None:
    service = PathService.get_instance()
    original_root = service._project_root
    original_user_dir = service._user_data_dir

    try:
        service._project_root = tmp_path
        service._user_data_dir = tmp_path / "data" / "user"

        store = SQLiteSessionStore()

        assert store.db_path == tmp_path / "data" / "user" / "chat_history.db"
        assert store.db_path.exists()
    finally:
        service._project_root = original_root
        service._user_data_dir = original_user_dir


def test_sqlite_store_migrates_legacy_chat_history_db(tmp_path: Path) -> None:
    service = PathService.get_instance()
    original_root = service._project_root
    original_user_dir = service._user_data_dir

    try:
        service._project_root = tmp_path
        service._user_data_dir = tmp_path / "data" / "user"
        legacy_db = tmp_path / "data" / "chat_history.db"
        legacy_db.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(legacy_db) as conn:
            conn.execute("CREATE TABLE legacy (id INTEGER PRIMARY KEY)")
            conn.commit()

        store = SQLiteSessionStore()

        assert store.db_path.exists()
        assert not legacy_db.exists()
    finally:
        service._project_root = original_root
        service._user_data_dir = original_user_dir


@pytest.fixture
def store(tmp_path: Path) -> SQLiteSessionStore:
    return SQLiteSessionStore(db_path=tmp_path / "test.db")


def _make_items(*specs):
    """Build notebook entry dicts from (qid, question, is_correct) tuples."""
    items = []
    for qid, question, is_correct in specs:
        items.append({
            "question_id": qid,
            "question": question,
            "question_type": "choice",
            "options": {"A": "opt_a", "B": "opt_b"},
            "user_answer": "A",
            "correct_answer": "B",
            "explanation": "expl",
            "difficulty": "medium",
            "is_correct": is_correct,
        })
    return items


def test_create_and_fetch_exam_attempt(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Exam Session"))
    artifact = asyncio.run(
        store.create_exam_artifact(
            {
                "exam_id": "exam_1",
                "title": "Midterm",
                "mode": "timed",
                "source_session_id": session["id"],
                "knowledge_base": "kb",
                "total_points": 2,
                "questions": [],
            }
        )
    )

    attempt = asyncio.run(
        store.create_exam_attempt(
            artifact["exam_id"],
            session["id"],
            {"status": "in_progress", "answers": [], "score_report": None},
        )
    )

    loaded = asyncio.run(store.get_exam_attempt(attempt["attempt_id"]))
    assert loaded is not None
    assert loaded["exam_id"] == artifact["exam_id"]
    assert loaded["status"] == "in_progress"


def test_course_template_round_trips_import_report(store: SQLiteSessionStore) -> None:
    payload = {
        "course_id": "course-storage-1",
        "title": "Stored Graph",
        "source_type": "manual_json",
        "source_summary": "1 section",
        "import_version": "v1",
        "nodes": [],
        "edges": [],
        "audit": {
            "backbone_node_ids": [],
            "enriched_node_ids": [],
            "backbone_edge_ids": [],
            "enriched_edge_ids": [],
            "warnings": [],
        },
        "import_report": {
            "status": "backbone_only",
            "topic_node_count": 0,
            "enrichment_node_count": 0,
            "edge_count": 0,
            "cross_link_count": 0,
            "warning_count": 0,
        },
    }

    asyncio.run(store.upsert_course_template(payload["course_id"], json.dumps(payload)))
    stored = asyncio.run(store.get_course_template(payload["course_id"]))

    assert stored is not None
    assert "backbone_only" in stored["template_json"]


def test_store_persists_graph_qa_report_and_draft(store: SQLiteSessionStore) -> None:
    payload = {
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
    report = {
        "course_id": "intro-ai",
        "health_summary": {
            "score": 90,
            "adaptive_ready": True,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
        },
        "issues": [],
        "suggested_fixes": [],
        "gate_status": {
            "status": "adaptive_ready",
            "blocking_issue_ids": [],
            "student_visible_message": "",
            "instructor_message": "",
        },
    }
    draft = {
        "course_id": "intro-ai",
        "changes": [
            {
                "change_id": "change_1",
                "fix_id": "fix_edge_intro_search",
                "change_type": "change_relation_type",
                "preview": {"edge_id": "edge_intro_search"},
            }
        ],
    }

    assert asyncio.run(store.upsert_course_template("intro-ai", json.dumps(payload))) is True
    assert asyncio.run(store.save_graph_qa_report("intro-ai", report)) is True
    assert asyncio.run(store.save_graph_qa_draft("intro-ai", draft)) is True
    assert asyncio.run(store.get_graph_qa_report("intro-ai"))["course_id"] == "intro-ai"
    assert (
        asyncio.run(store.get_graph_qa_draft("intro-ai"))["changes"][0]["fix_id"]
        == "fix_edge_intro_search"
    )
    gate = asyncio.run(store.get_graph_adaptive_gate("intro-ai"))
    assert gate is not None
    assert gate["status"] == "adaptive_ready"
    assert gate["blocking_issue_ids"] == []


def test_store_persists_graph_adaptive_gate_directly(store: SQLiteSessionStore) -> None:
    payload = {
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
    gate = {
        "status": "adaptive_blocked",
        "blocking_issue_ids": ["issue_cycle"],
    }

    assert asyncio.run(store.upsert_course_template("intro-ai", json.dumps(payload))) is True
    assert asyncio.run(store.save_graph_adaptive_gate("intro-ai", gate)) is True

    stored = asyncio.run(store.get_graph_adaptive_gate("intro-ai"))

    assert stored is not None
    assert stored["subject_id"] == "intro-ai"
    assert stored["status"] == "adaptive_blocked"
    assert stored["blocking_issue_ids"] == ["issue_cycle"]


def test_get_graph_qa_payloads_return_none_for_invalid_json_shapes(store: SQLiteSessionStore) -> None:
    payload = {
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

    assert asyncio.run(store.upsert_course_template("intro-ai", json.dumps(payload))) is True

    with sqlite3.connect(store.db_path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO graph_qa_reports (subject_id, report_json, analyzed_at, updated_at)
            VALUES (?, ?, 1.0, 1.0)
            """,
            ("intro-ai", '["not-a-dict"]'),
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO graph_qa_drafts (subject_id, draft_json, created_at, updated_at)
            VALUES (?, ?, 1.0, 1.0)
            """,
            ("intro-ai", '"not-a-dict"'),
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO graph_qa_reports (subject_id, report_json, analyzed_at, updated_at)
            VALUES (?, ?, 2.0, 2.0)
            """,
            ("broken-report", '{"broken":'),
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO graph_qa_drafts (subject_id, draft_json, created_at, updated_at)
            VALUES (?, ?, 2.0, 2.0)
            """,
            ("broken-draft", "["),
        )
        conn.commit()

    assert asyncio.run(store.get_graph_qa_report("intro-ai")) is None
    assert asyncio.run(store.get_graph_qa_draft("intro-ai")) is None
    assert asyncio.run(store.get_graph_qa_report("broken-report")) is None
    assert asyncio.run(store.get_graph_qa_draft("broken-draft")) is None


def test_save_graph_qa_report_rolls_back_when_gate_write_fails(
    store: SQLiteSessionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
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
    report = {
        "course_id": "intro-ai",
        "health_summary": {
            "score": 90,
            "adaptive_ready": True,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
        },
        "issues": [],
        "suggested_fixes": [],
        "gate_status": {
            "status": "adaptive_ready",
            "blocking_issue_ids": [],
            "student_visible_message": "",
            "instructor_message": "",
        },
    }

    assert asyncio.run(store.upsert_course_template("intro-ai", json.dumps(payload))) is True

    def fail_gate_write(*args, **kwargs) -> bool:
        raise RuntimeError("gate write failed")

    monkeypatch.setattr(store, "_save_graph_adaptive_gate_with_conn", fail_gate_write)

    with pytest.raises(RuntimeError, match="gate write failed"):
        asyncio.run(store.save_graph_qa_report("intro-ai", report))

    assert asyncio.run(store.get_graph_qa_report("intro-ai")) is None
    assert asyncio.run(store.get_graph_adaptive_gate("intro-ai")) is None


def test_save_graph_qa_report_rolls_back_when_gate_write_returns_false(
    store: SQLiteSessionStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
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
    report = {
        "course_id": "intro-ai",
        "health_summary": {
            "score": 90,
            "adaptive_ready": True,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
        },
        "issues": [],
        "suggested_fixes": [],
        "gate_status": {
            "status": "adaptive_ready",
            "blocking_issue_ids": [],
            "student_visible_message": "",
            "instructor_message": "",
        },
    }

    assert asyncio.run(store.upsert_course_template("intro-ai", json.dumps(payload))) is True

    def fail_gate_write(*args, **kwargs) -> bool:
        return False

    monkeypatch.setattr(store, "_save_graph_adaptive_gate_with_conn", fail_gate_write)

    assert asyncio.run(store.save_graph_qa_report("intro-ai", report)) is False
    assert asyncio.run(store.get_graph_qa_report("intro-ai")) is None
    assert asyncio.run(store.get_graph_adaptive_gate("intro-ai")) is None


def test_mark_node_progress_updates_current_node_and_preserves_dynamic_nodes(
    store: SQLiteSessionStore,
) -> None:
    session = asyncio.run(store.create_session(title="Graph Session"))
    asyncio.run(
        store.upsert_course_template(
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
    )
    asyncio.run(
        store.upsert_student_state(
            session["id"],
            "intro-ai",
            {
                "current_node_id": "topic_intro",
                "mastered_nodes": [],
                "explored_nodes": [],
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
    )

    asyncio.run(
        store.mark_node_progress(
            session["id"],
            "intro-ai",
            "topic_search",
            "explored",
            current_node_id="topic_search",
        )
    )

    state = asyncio.run(store.get_student_state(session["id"], "intro-ai"))

    assert state is not None
    assert state["current_node_id"] == "topic_search"
    assert state["explored_nodes"] == ["topic_search"]
    assert state["dynamic_nodes"][0]["node_id"] == "sq_review_intro"


# ── Notebook entries ──────────────────────────────────────────────

def test_upsert_notebook_entries_persists_all(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Test"))
    items = _make_items(("q1", "2+2?", False), ("q2", "3+3?", True), ("q3", "5+5?", False))
    upserted = asyncio.run(store.upsert_notebook_entries(session["id"], items))
    assert upserted == 3
    result = asyncio.run(store.list_notebook_entries())
    assert result["total"] == 3
    assert all(e["session_title"] == "Test" for e in result["items"])


def test_upsert_notebook_entries_updates_on_conflict(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    sid = session["id"]
    asyncio.run(store.upsert_notebook_entries(sid, _make_items(("q1", "Q?", False))))
    result = asyncio.run(store.list_notebook_entries())
    assert result["items"][0]["is_correct"] is False

    asyncio.run(store.upsert_notebook_entries(sid, [{
        "question_id": "q1", "question": "Q?", "user_answer": "B",
        "correct_answer": "B", "is_correct": True,
    }]))
    result = asyncio.run(store.list_notebook_entries())
    assert result["total"] == 1
    assert result["items"][0]["is_correct"] is True
    assert result["items"][0]["user_answer"] == "B"


def test_upsert_skips_blank_questions(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    items = [
        {"question_id": "q1", "question": "", "is_correct": False},
        {"question_id": "", "question": "Valid?", "is_correct": False},
        {"question_id": "q3", "question": "OK?", "is_correct": False},
    ]
    upserted = asyncio.run(store.upsert_notebook_entries(session["id"], items))
    assert upserted == 1


def test_upsert_unknown_session_raises(store: SQLiteSessionStore) -> None:
    with pytest.raises(ValueError, match="Session not found"):
        asyncio.run(store.upsert_notebook_entries("nope", _make_items(("q1", "Q?", False))))


def test_list_entries_filters_bookmarked(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(
        ("q1", "Q1?", False), ("q2", "Q2?", True),
    )))
    entries = asyncio.run(store.list_notebook_entries())["items"]
    asyncio.run(store.update_notebook_entry(entries[0]["id"], {"bookmarked": True}))
    bm = asyncio.run(store.list_notebook_entries(bookmarked=True))
    assert bm["total"] == 1
    assert bm["items"][0]["bookmarked"] is True


def test_list_entries_filters_is_correct(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(
        ("q1", "Q1?", False), ("q2", "Q2?", True),
    )))
    wrong = asyncio.run(store.list_notebook_entries(is_correct=False))
    assert wrong["total"] == 1
    assert wrong["items"][0]["question_id"] == "q1"


def test_update_notebook_entry_bookmark_roundtrip(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(("q1", "Q?", False))))
    eid = asyncio.run(store.list_notebook_entries())["items"][0]["id"]
    assert asyncio.run(store.update_notebook_entry(eid, {"bookmarked": True})) is True
    assert asyncio.run(store.get_notebook_entry(eid))["bookmarked"] is True
    assert asyncio.run(store.update_notebook_entry(eid, {"bookmarked": False})) is True
    assert asyncio.run(store.get_notebook_entry(eid))["bookmarked"] is False
    assert asyncio.run(store.update_notebook_entry(99999, {"bookmarked": True})) is False


def test_update_followup_session_id(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(("q1", "Q?", False))))
    eid = asyncio.run(store.list_notebook_entries())["items"][0]["id"]
    asyncio.run(store.update_notebook_entry(eid, {"followup_session_id": "sess_fu"}))
    entry = asyncio.run(store.get_notebook_entry(eid))
    assert entry["followup_session_id"] == "sess_fu"


def test_find_notebook_entry(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(("q1", "Q?", False))))
    found = asyncio.run(store.find_notebook_entry(session["id"], "q1"))
    assert found is not None
    assert found["question_id"] == "q1"
    assert asyncio.run(store.find_notebook_entry(session["id"], "nope")) is None


def test_delete_notebook_entry(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(
        ("q1", "Q1?", False), ("q2", "Q2?", False),
    )))
    eid = asyncio.run(store.list_notebook_entries())["items"][0]["id"]
    assert asyncio.run(store.delete_notebook_entry(eid)) is True
    assert asyncio.run(store.list_notebook_entries())["total"] == 1
    assert asyncio.run(store.delete_notebook_entry(99999)) is False


def test_entries_cascade_on_session_delete(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(("q1", "Q?", False))))
    assert asyncio.run(store.list_notebook_entries())["total"] == 1
    asyncio.run(store.delete_session(session["id"]))
    assert asyncio.run(store.list_notebook_entries())["total"] == 0


# ── Categories ────────────────────────────────────────────────────

def test_category_crud(store: SQLiteSessionStore) -> None:
    cat = asyncio.run(store.create_category("Math"))
    assert cat["name"] == "Math"
    cats = asyncio.run(store.list_categories())
    assert len(cats) == 1
    assert cats[0]["entry_count"] == 0

    asyncio.run(store.rename_category(cat["id"], "Algebra"))
    cats = asyncio.run(store.list_categories())
    assert cats[0]["name"] == "Algebra"

    asyncio.run(store.delete_category(cat["id"]))
    assert asyncio.run(store.list_categories()) == []


def test_entry_category_association(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(("q1", "Q?", False))))
    eid = asyncio.run(store.list_notebook_entries())["items"][0]["id"]
    cat = asyncio.run(store.create_category("Physics"))

    assert asyncio.run(store.add_entry_to_category(eid, cat["id"])) is True
    entry = asyncio.run(store.get_notebook_entry(eid))
    assert len(entry["categories"]) == 1
    assert entry["categories"][0]["name"] == "Physics"

    by_cat = asyncio.run(store.list_notebook_entries(category_id=cat["id"]))
    assert by_cat["total"] == 1

    asyncio.run(store.remove_entry_from_category(eid, cat["id"]))
    assert asyncio.run(store.get_entry_categories(eid)) == []


def test_category_cascade_on_entry_delete(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session())
    asyncio.run(store.upsert_notebook_entries(session["id"], _make_items(("q1", "Q?", False))))
    eid = asyncio.run(store.list_notebook_entries())["items"][0]["id"]
    cat = asyncio.run(store.create_category("History"))
    asyncio.run(store.add_entry_to_category(eid, cat["id"]))
    asyncio.run(store.delete_notebook_entry(eid))
    cats = asyncio.run(store.list_categories())
    assert cats[0]["entry_count"] == 0
