from __future__ import annotations

import asyncio
import importlib
import json
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

FastAPI = pytest.importorskip("fastapi").FastAPI
TestClient = pytest.importorskip("fastapi.testclient").TestClient

from deeptutor.services.session.sqlite_store import SQLiteSessionStore
from tests.services.graph.test_qa import build_graph_with_suspect_part_of

graph_qa_module = importlib.import_module("deeptutor.api.routers.graph_qa")


def _build_app(store: SQLiteSessionStore) -> FastAPI:
    app = FastAPI()
    app.include_router(graph_qa_module.router, prefix="/api/v1/graph")
    return app


@pytest.fixture
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SQLiteSessionStore:
    instance = SQLiteSessionStore(db_path=tmp_path / "graph-qa-router.db")
    monkeypatch.setattr(graph_qa_module, "get_sqlite_session_store", lambda: instance)
    return instance


def _seed_course(store: SQLiteSessionStore, course_id: str = "intro-ai") -> None:
    asyncio.run(
        store.upsert_course_template(
            course_id,
            json.dumps(build_graph_with_suspect_part_of().model_dump()),
        )
    )


def _overwrite_course_template_without_cascade(
    store: SQLiteSessionStore,
    course_id: str,
    graph_payload: dict[str, object],
) -> None:
    with store._connect() as conn:
        conn.execute(
            "UPDATE course_graph_templates SET template_json = ? WHERE subject_id = ?",
            (json.dumps(graph_payload), course_id),
        )
        conn.commit()


def test_analyze_graph_qa_returns_report(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        response = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert response.status_code == 200
        body = response.json()
        assert body["course_id"] == "intro-ai"
        assert body["health_summary"]["high_count"] == 1
        assert body["suggested_fixes"][0]["change_type"] == "change_relation_type"
    gate = asyncio.run(store.get_graph_adaptive_gate("intro-ai"))
    assert gate is not None
    assert gate["status"] == body["gate_status"]["status"]
    assert gate["blocking_issue_ids"] == body["gate_status"]["blocking_issue_ids"]


def test_get_graph_qa_report_returns_validated_payload(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        analyze = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert analyze.status_code == 200

        response = client.get("/api/v1/graph/qa/intro-ai")
        assert response.status_code == 200
        assert response.json()["course_id"] == "intro-ai"
        assert response.json()["gate_status"]["status"] == "adaptive_limited"


def test_apply_graph_qa_fix_updates_report(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        analyze = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert analyze.status_code == 200

        response = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/apply",
            json={"fix_id": "fix_edge_intro_search"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["gate_status"]["status"] == "adaptive_ready"
    gate = asyncio.run(store.get_graph_adaptive_gate("intro-ai"))
    assert gate is not None
    assert gate["status"] == body["gate_status"]["status"]
    assert gate["blocking_issue_ids"] == body["gate_status"]["blocking_issue_ids"]


def test_graph_qa_apply_fix_clears_high_issue(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        analyze = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert analyze.status_code == 200

        response = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/apply",
            json={"fix_id": "fix_edge_intro_search"},
        )
        assert response.status_code == 200
        assert response.json()["health_summary"]["high_count"] == 0
        assert response.json()["gate_status"]["status"] == "adaptive_ready"


def test_graph_qa_draft_commit_reanalyzes(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        client.post("/api/v1/graph/qa/analyze/intro-ai")
        stage = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/draft",
            json={"fix_ids": ["fix_edge_intro_search"]},
        )
        assert stage.status_code == 200

        commit = client.post("/api/v1/graph/qa/draft/intro-ai/commit")
        assert commit.status_code == 200
        body = commit.json()
        assert body["gate_status"]["status"] == "adaptive_ready"
    gate = asyncio.run(store.get_graph_adaptive_gate("intro-ai"))
    assert gate is not None
    assert gate["status"] == body["gate_status"]["status"]
    assert gate["blocking_issue_ids"] == body["gate_status"]["blocking_issue_ids"]


def test_analyze_graph_qa_returns_404_for_missing_course(store: SQLiteSessionStore) -> None:
    with TestClient(_build_app(store)) as client:
        response = client.post("/api/v1/graph/qa/analyze/missing-course")
        assert response.status_code == 404
        assert response.json()["detail"] == "Course graph not found"


def test_get_graph_qa_report_returns_404_for_missing_report(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        response = client.get("/api/v1/graph/qa/intro-ai")
        assert response.status_code == 404
        assert response.json()["detail"] == "Graph QA report not found"


def test_get_graph_qa_draft_returns_staged_changes(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        analyze = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert analyze.status_code == 200
        stage = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/draft",
            json={"fix_ids": ["fix_edge_intro_search"]},
        )
        assert stage.status_code == 200

        response = client.get("/api/v1/graph/qa/draft/intro-ai")
        assert response.status_code == 200
        assert response.json()["changes"][0]["fix_id"] == "fix_edge_intro_search"


def test_apply_graph_qa_fix_returns_404_for_missing_fix(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        analyze = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert analyze.status_code == 200

        response = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/apply",
            json={"fix_id": "fix_missing"},
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Graph QA fix not found"


def test_apply_graph_qa_fix_returns_error_when_fix_is_stale(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        analyze = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert analyze.status_code == 200

    clean_graph = build_graph_with_suspect_part_of().model_copy(deep=True)
    clean_graph.edges[0].relation_type = "prerequisite"
    _overwrite_course_template_without_cascade(store, "intro-ai", clean_graph.model_dump())

    with TestClient(_build_app(store)) as client:
        response = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/apply",
            json={"fix_id": "fix_edge_intro_search"},
        )
        assert response.status_code == 409


def test_commit_graph_qa_draft_returns_error_when_change_is_stale(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        analyze = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert analyze.status_code == 200
        stage = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/draft",
            json={"fix_ids": ["fix_edge_intro_search"]},
        )
        assert stage.status_code == 200

    clean_graph = build_graph_with_suspect_part_of().model_copy(deep=True)
    clean_graph.edges[0].relation_type = "prerequisite"
    _overwrite_course_template_without_cascade(store, "intro-ai", clean_graph.model_dump())

    with TestClient(_build_app(store)) as client:
        response = client.post("/api/v1/graph/qa/draft/intro-ai/commit")
        assert response.status_code == 409


def test_get_graph_qa_report_rejects_malformed_persisted_payload(store: SQLiteSessionStore) -> None:
    _seed_course(store)
    asyncio.run(
        store.save_graph_qa_report(
            "intro-ai",
            {
                "course_id": "intro-ai",
                "gate_status": {
                    "status": "adaptive_limited",
                    "blocking_issue_ids": [],
                },
            },
        )
    )

    with TestClient(_build_app(store)) as client:
        response = client.get("/api/v1/graph/qa/intro-ai")
        assert response.status_code == 422


def test_stage_graph_qa_fixes_keeps_only_safe_known_subset(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    unsafe_report = {
        "course_id": "intro-ai",
        "health_summary": {
            "score": 40,
            "adaptive_ready": False,
            "critical_count": 0,
            "high_count": 1,
            "medium_count": 0,
            "low_count": 0,
        },
        "issues": [
            {
                "issue_id": "issue_1",
                "severity": "high",
                "kind": "suspect_part_of_should_be_prerequisite",
                "message": "bad edge",
                "affected_node_ids": ["topic_intro", "topic_search"],
                "affected_edge_ids": ["edge_intro_search"],
                "why_it_matters": "routing",
            }
        ],
        "suggested_fixes": [
            {
                "fix_id": "fix_edge_intro_search",
                "issue_id": "issue_1",
                "confidence": 0.9,
                "change_type": "change_relation_type",
                "preview": {
                    "edge_id": "edge_intro_search",
                    "after": {"relation_type": "prerequisite"},
                },
                "safe_for_bulk_apply": True,
            },
            {
                "fix_id": "fix_unsafe_edge_intro_search",
                "issue_id": "issue_1",
                "confidence": 0.5,
                "change_type": "change_relation_type",
                "preview": {
                    "edge_id": "edge_intro_search",
                    "after": {"relation_type": "related"},
                },
                "safe_for_bulk_apply": False,
            },
        ],
        "gate_status": {
            "status": "adaptive_limited",
            "blocking_issue_ids": ["issue_1"],
            "student_visible_message": "",
            "instructor_message": "",
        },
    }
    asyncio.run(store.save_graph_qa_report("intro-ai", unsafe_report))

    with TestClient(_build_app(store)) as client:
        response = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/draft",
            json={
                "fix_ids": [
                    "fix_edge_intro_search",
                    "fix_unsafe_edge_intro_search",
                    "fix_missing",
                ]
            },
        )
        assert response.status_code == 200
        assert response.json() == {
            "course_id": "intro-ai",
            "changes": [
                {
                    "change_id": "change_fix_edge_intro_search",
                    "fix_id": "fix_edge_intro_search",
                    "change_type": "change_relation_type",
                    "preview": {
                        "edge_id": "edge_intro_search",
                        "after": {"relation_type": "prerequisite"},
                    },
                }
            ],
        }


def test_stage_graph_qa_fixes_rejects_malformed_report(store: SQLiteSessionStore) -> None:
    _seed_course(store)
    asyncio.run(
        store.save_graph_qa_report(
            "intro-ai",
            {
                "course_id": "intro-ai",
                "gate_status": {
                    "status": "adaptive_limited",
                    "blocking_issue_ids": [],
                },
            },
        )
    )

    with TestClient(_build_app(store)) as client:
        response = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/draft",
            json={"fix_ids": ["fix_edge_intro_search"]},
        )
        assert response.status_code == 422


def test_commit_graph_qa_draft_rejects_malformed_draft(store: SQLiteSessionStore) -> None:
    _seed_course(store)
    asyncio.run(store.save_graph_qa_draft("intro-ai", {"course_id": "intro-ai", "changes": [{}]}))

    with TestClient(_build_app(store)) as client:
        response = client.post("/api/v1/graph/qa/draft/intro-ai/commit")
        assert response.status_code == 422


def test_commit_graph_qa_draft_returns_404_for_missing_draft(store: SQLiteSessionStore) -> None:
    _seed_course(store)

    with TestClient(_build_app(store)) as client:
        response = client.post("/api/v1/graph/qa/draft/intro-ai/commit")
        assert response.status_code == 404
        assert response.json()["detail"] == "Graph QA draft not found"
