from __future__ import annotations

import asyncio
import importlib
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

FastAPI = pytest.importorskip("fastapi").FastAPI
TestClient = pytest.importorskip("fastapi.testclient").TestClient
exam_attempts_router = importlib.import_module("deeptutor.api.routers.exam_attempts").router

from deeptutor.services.session.sqlite_store import SQLiteSessionStore


def _build_app(store: SQLiteSessionStore) -> FastAPI:
    app = FastAPI()
    app.include_router(exam_attempts_router, prefix="/api/v1")
    return app


@pytest.fixture
def store(tmp_path: Path, monkeypatch) -> SQLiteSessionStore:
    instance = SQLiteSessionStore(db_path=tmp_path / "exam-router.db")
    monkeypatch.setattr(
        "deeptutor.api.routers.exam_attempts.get_sqlite_session_store",
        lambda: instance,
    )
    return instance


def test_create_submit_and_fetch_exam_attempt(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Exam Session"))

    with TestClient(_build_app(store)) as client:
        create = client.post(
            "/api/v1/exam-attempts",
            json={
                "exam_artifact": {
                    "exam_id": "exam_1",
                    "title": "Midterm",
                    "mode": "timed",
                    "source_session_id": session["id"],
                    "knowledge_base": "kb",
                    "total_points": 2,
                    "questions": [],
                },
                "session_id": session["id"],
            },
        )
        assert create.status_code == 201
        attempt_id = create.json()["attempt"]["attempt_id"]

        patch = client.patch(
            f"/api/v1/exam-attempts/{attempt_id}",
            json={
                "answers": [
                    {
                        "question_id": "q1",
                        "response": {"choice_ids": ["B"]},
                    }
                ]
            },
        )
        assert patch.status_code == 200
        assert patch.json()["attempt"]["answers"][0]["question_id"] == "q1"

        submit = client.post(f"/api/v1/exam-attempts/{attempt_id}/submit")
        assert submit.status_code == 200
        assert submit.json()["attempt"]["status"] in {"grading", "graded"}

        loaded = client.get(f"/api/v1/exam-attempts/{attempt_id}")
        assert loaded.status_code == 200
        assert loaded.json()["attempt"]["attempt_id"] == attempt_id


def test_list_exam_attempts_for_session(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Exam Session"))
    asyncio.run(
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
    asyncio.run(
        store.create_exam_attempt(
            "exam_1",
            session["id"],
            {"status": "in_progress", "answers": [], "score_report": None},
        )
    )

    with TestClient(_build_app(store)) as client:
        resp = client.get(f"/api/v1/sessions/{session['id']}/exam-attempts")
        assert resp.status_code == 200
        assert len(resp.json()["attempts"]) == 1
