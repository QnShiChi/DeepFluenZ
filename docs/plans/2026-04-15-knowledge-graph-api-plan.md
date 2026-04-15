# Knowledge Graph API Bridge Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Establish a Real-time WebSocket connection between the Python backend and Next.js frontend to dynamically update the Knowledge Graph when a side quest is spawned.

---

### Task 1: Backend WebSocket Push logic

**Files:**
- Modify: `deeptutor/api/routers/exam_attempts.py`

**Steps:**
1. In `submit_exam_attempt`, inject the `handle_exam_failure` check if the score is poor.
2. Call `await store.upsert_student_state(...)` to persist the side quests.
3. Use `get_turn_runtime_manager()` to broadcast a system event: `{"type": "graph_updated", "content": state}` into the active `session_id`.

**Commit:**
```bash
git add deeptutor/api/routers/exam_attempts.py
git commit -m "feat(api): broadcast graph updates via websocket on exam failure"
```

---

### Task 2: Frontend Graph Listener

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`

**Steps:**
1. Import `UnifiedWSClient`.
2. Add a `useEffect` to hook into incoming socket messages.
3. When `msg.type === "graph_updated"` is intercepted, transform the incoming `mastered_nodes` and `dynamic_nodes` into `@xyflow/react` node objects and update the UI graph state (`setNodes`).

**Commit:**
```bash
git add web/components/graph/KnowledgeGraphViewer.tsx
git commit -m "feat(ui): connect knowledge graph to real-time websocket"
```
