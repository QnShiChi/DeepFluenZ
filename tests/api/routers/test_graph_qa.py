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


def test_analyze_graph_qa_returns_report(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.upsert_course_template(
            "intro-ai",
            json.dumps(build_graph_with_suspect_part_of().model_dump()),
        )
    )

    with TestClient(_build_app(store)) as client:
        response = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert response.status_code == 200
        body = response.json()
        assert body["course_id"] == "intro-ai"
        assert body["health_summary"]["high_count"] == 1
        assert body["suggested_fixes"][0]["change_type"] == "change_relation_type"


def test_graph_qa_draft_commit_reanalyzes(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.upsert_course_template(
            "intro-ai",
            json.dumps(build_graph_with_suspect_part_of().model_dump()),
        )
    )

    with TestClient(_build_app(store)) as client:
        client.post("/api/v1/graph/qa/analyze/intro-ai")
        stage = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/draft",
            json={"fix_ids": ["fix_edge_intro_search"]},
        )
        assert stage.status_code == 200

        commit = client.post("/api/v1/graph/qa/draft/intro-ai/commit")
        assert commit.status_code == 200
        assert commit.json()["gate_status"]["status"] == "adaptive_ready"
