# Knowledge Graph Database Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Modify `sqlite_store.py` to persist `CourseGraphTemplates` and `StudentGraphStates`.

**Architecture:** Use SQLite text blocks to store JSON schemas for graphs and side quests, while referencing `session_id` to link a graph to a user's progress.

---

### Task 1: Add Database Table Schemas

**Files:**
- Modify: `deeptutor/services/session/sqlite_store.py`

**Step 1: Write the failing test / initial minimal structure**
In `_initialize()` method, add two new schemas to `conn.executescript`:
```sql
CREATE TABLE IF NOT EXISTS course_graph_templates (
    subject_id TEXT PRIMARY KEY,
    template_json TEXT DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS student_graph_states (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES course_graph_templates(subject_id) ON DELETE CASCADE,
    current_node_id TEXT DEFAULT '',
    mastered_nodes_json TEXT DEFAULT '[]',
    dynamic_nodes_json TEXT DEFAULT '[]',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (session_id, subject_id)
);
```

**Step 2: Commit**
```bash
git add deeptutor/services/session/sqlite_store.py
git commit -m "feat(db): schema for knowledge graph templates and states"
```

---

### Task 2: Implement DB Accessor Functions

**Files:**
- Modify: `deeptutor/services/session/sqlite_store.py`

**Step 1: Write methods**
Add methods to `SQLiteSessionStore`:
- `_upsert_course_template_sync(subject_id, template_json)` & `async upsert_course_template()`
- `_get_course_template_sync(subject_id)` & `async get_course_template()`
- `_upsert_student_state_sync(session_id, subject_id, state_dict)` & `async upsert_student_state()`
- `_get_student_state_sync(session_id, subject_id)` & `async get_student_state()`

*(These will follow the standard pattern of `conn.execute` using `_connect()` inside `sqlite_store.py`)*

**Step 2: Run verification**
Run: `pytest tests/` (or specific tests if available, but at least `pytest` or `ruff check deeptutor/services/session/sqlite_store.py`) to ensure no syntax errors.

**Step 3: Commit**
```bash
git add deeptutor/services/session/sqlite_store.py
git commit -m "feat(db): implement graph accessors"
```
