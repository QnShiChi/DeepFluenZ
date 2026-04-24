import importlib
from pathlib import Path

import pytest

from deeptutor.services.session.sqlite_store import SQLiteSessionStore

course_templates_module = importlib.import_module("deeptutor.api.routers.course_templates")


@pytest.fixture
def store(tmp_path: Path) -> SQLiteSessionStore:
    return SQLiteSessionStore(db_path=tmp_path / "course-template-router.db")


def build_graph_payload(course_id: str) -> dict:
    return {
        "course_id": course_id,
        "title": "Intro to AI",
        "source_type": "manual_json",
        "source_summary": "2 sections",
        "import_version": "v1",
        "nodes": [
            {
                "node_id": "topic_intro",
                "title": "Introduction to AI",
                "node_type": "topic",
                "description": "Overview",
                "difficulty": "easy",
                "learning_outcomes": [],
                "examples": [],
                "related_questions": [],
                "resources": [],
                "source_refs": [],
            }
        ],
        "edges": [],
        "audit": {
            "backbone_node_ids": ["topic_intro"],
            "enriched_node_ids": [],
            "backbone_edge_ids": [],
            "enriched_edge_ids": [],
            "warnings": [],
        },
        "import_report": {
            "status": "backbone_only",
            "topic_node_count": 1,
            "enrichment_node_count": 0,
            "edge_count": 0,
            "cross_link_count": 0,
            "warning_count": 0,
        },
    }


@pytest.mark.anyio
async def test_import_course_template_returns_import_report(store: SQLiteSessionStore) -> None:
    response = await course_templates_module.import_course_template(
        payload=build_graph_payload("test-course-import-knowledge-1"),
        store=store,
    )

    assert response["course_id"] == "test-course-import-knowledge-1"
    assert response["import_report"]["status"] == "backbone_only"


@pytest.mark.anyio
async def test_get_course_template(store: SQLiteSessionStore) -> None:
    await course_templates_module.import_course_template(
        payload=build_graph_payload("test-course-import-knowledge-2"),
        store=store,
    )

    response = await course_templates_module.get_course_template(
        course_id="test-course-import-knowledge-2",
        store=store,
    )

    assert response["course_id"] == "test-course-import-knowledge-2"
    assert response["title"] == "Intro to AI"
    assert response["import_report"]["status"] == "backbone_only"


@pytest.mark.anyio
async def test_import_course_template_persists_course_id_in_session_preferences(store: SQLiteSessionStore) -> None:
    session = await store.create_session(title="Graph session")

    payload = build_graph_payload("test-course-import-knowledge-3")
    payload["session_id"] = session["session_id"]

    response = await course_templates_module.import_course_template(
        payload=payload,
        store=store,
    )

    assert response["course_id"] == "test-course-import-knowledge-3"
    updated_session = await store.get_session(session["session_id"])
    assert updated_session is not None
    assert updated_session["preferences"]["course_id"] == "test-course-import-knowledge-3"
