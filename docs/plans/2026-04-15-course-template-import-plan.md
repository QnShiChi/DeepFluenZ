# Course Template Import Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a JSON file upload feature to import `CourseGraphTemplate`s to SQLite and render them natively on the React UI.

**Architecture:** Create two new FastAPI endpoints (`POST /import`, `GET /{course_id}`) using the existing `sqlite_store.py` logic. Add an Import button in Next.js, and refactor the `KnowledgeGraphViewer` to fetch the template dynamically on mount.

**Tech Stack:** FastAPI, Next.js, React Flow

---

### Task 1: Backend API `POST /api/v1/course-templates/import`

**Files:**
- Create: `deeptutor/api/routers/course_templates.py`
- Modify: `deeptutor/api/main.py` (include router)
- Test: `tests/api/routers/test_course_templates.py`

**Step 1: Write the failing test**

```python
import pytest
from fastapi.testclient import TestClient

def test_import_course_template(client: TestClient):
    payload = {
        "course_id": "test-course",
        "title": "Test Course",
        "nodes": [{"node_id": "root", "title": "Root Node", "node_type": "core"}],
        "edges": []
    }
    response = client.post("/api/v1/course-templates/import", json=payload)
    assert response.status_code == 200
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/api/routers/test_course_templates.py::test_import_course_template -v`
Expected: FAIL 

**Step 3: Write minimal implementation**

Implement `deeptutor/api/routers/course_templates.py`. Create `POST` accepting `dict` body, call `store.upsert_course_template(payload)`. Register router in `deeptutor/api/main.py`.

**Step 4: Run test to verify it passes**

Run: `pytest tests/api/routers/test_course_templates.py::test_import_course_template -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/api/routers/test_course_templates.py deeptutor/api/routers/course_templates.py deeptutor/api/main.py
git commit -m "feat(api): add POST /course-templates/import endpoint"
```

### Task 2: Backend API `GET /api/v1/course-templates/{course_id}`

**Files:**
- Modify: `deeptutor/api/routers/course_templates.py`
- Modify: `deeptutor/services/session/sqlite_store.py`

**Step 1: Write the failing test**

```python
def test_get_course_template(client: TestClient):
    response = client.get("/api/v1/course-templates/test-course")
    assert response.status_code == 200
    assert response.json()["course_id"] == "test-course"
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/api/routers/test_course_templates.py::test_get_course_template -v`
Expected: FAIL.

**Step 3: Write minimal implementation**

Add `get_course_template(course_id)` to `sqlite_store.py`. Then implement GET endpoint in `course_templates.py`.

**Step 4: Run test to verify it passes**

Run: `pytest tests/api/routers/test_course_templates.py::test_get_course_template -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/api/routers/test_course_templates.py deeptutor/api/routers/course_templates.py deeptutor/services/session/sqlite_store.py
git commit -m "feat(api): add GET /course-templates/{course_id} endpoint"
```

### Task 3: Frontend `import` UI Button

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`

**Step 1: Write minimal implementation**

Add `<input type="file" accept=".json" .../>` disguised as a button in the UI controls bar.
In `onChange`, read file via `FileReader`, `JSON.parse`, and send `fetch("/api/v1/course-templates/import", { method: 'POST' ... })`. Add success Toast.

**Step 2: Commit**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx
git commit -m "feat(ui): add course template json upload button"
```

### Task 4: Frontend dynamic loading on mount

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`

**Step 1: Write minimal implementation**

Define fetching logic `fetch("/api/v1/course-templates/" + course_id)` inside `useEffect()`. 
Convert retrieved `nodes` into `DEFAULT_NODES` schema (assign explicit UI {x, y} offsets dynamically).
Set nodes and edges on the React Flow instance.

**Step 2: Commit**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx
git commit -m "feat(ui): fetch initial course template dynamically on component mount"
```
