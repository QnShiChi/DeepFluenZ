import asyncio
import pytest
from fastapi.testclient import TestClient
from deeptutor.api.main import app
from deeptutor.services.session.sqlite_store import get_sqlite_session_store

@pytest.fixture
def client():
    return TestClient(app)

def test_import_course_template(client: TestClient):
    payload = {
        "course_id": "test-course-import-1",
        "title": "Test Import Course",
        "nodes": [{"node_id": "root", "title": "Root Node", "node_type": "core", "dependencies": []}],
        "edges": []
    }
    response = client.post("/api/v1/course-templates/import", json=payload)
    assert response.status_code == 200
    assert response.json() == {"course_id": "test-course-import-1"}

def test_get_course_template(client: TestClient):
    response = client.get("/api/v1/course-templates/test-course-import-1")
    assert response.status_code == 200
    data = response.json()
    assert data["course_id"] == "test-course-import-1"
    assert data["title"] == "Test Import Course"


def test_import_course_template_persists_course_id_in_session_preferences(client: TestClient):
    store = get_sqlite_session_store()
    session = asyncio.run(store.create_session(title="Graph session"))

    payload = {
        "session_id": session["session_id"],
        "course_id": "test-course-import-2",
        "title": "Bound Course",
        "nodes": [{"node_id": "root", "title": "Root Node", "node_type": "core", "dependencies": []}],
        "edges": [],
    }

    response = client.post("/api/v1/course-templates/import", json=payload)

    assert response.status_code == 200
    updated_session = asyncio.run(store.get_session(session["session_id"]))
    assert updated_session is not None
    assert updated_session["preferences"]["course_id"] == "test-course-import-2"
