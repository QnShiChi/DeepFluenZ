import pytest
from fastapi.testclient import TestClient
from deeptutor.api.main import app

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
