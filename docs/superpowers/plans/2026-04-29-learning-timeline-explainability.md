# Learning Timeline + Explainability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a course-long learning timeline drawer on the Knowledge Graph screen that explains node progress, quiz/remediation milestones, and recommendation changes with both student-facing summaries and expandable expert details.

**Architecture:** Keep the timeline as a projection layer over existing graph progress, quiz, remediation, and recommendation transitions. Persist timeline events in a dedicated SQLite-backed store, expose them through a read-only FastAPI endpoint, then render them through a focused frontend drawer with filters, grouped events, and light action callbacks that reuse existing graph and quiz flows.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session store, pytest, TypeScript, React/Next.js, Node test runner

---

## File Structure

### Backend timeline domain

- Modify: `deeptutor/services/graph/models.py`
  - add typed learning timeline event, category, reason-tag, and action models
- Create: `deeptutor/services/graph/timeline.py`
  - build deterministic events, format summaries, and detect meaningful recommendation changes
- Create: `tests/services/graph/test_timeline.py`
  - unit coverage for event creation and explainability payloads

### Backend persistence and API

- Modify: `deeptutor/services/session/sqlite_store.py`
  - add timeline event persistence and filtered reads by `course_id`, `category`, and `node_id`
- Create: `deeptutor/api/routers/graph_timeline.py`
  - read-only timeline endpoint
- Modify: `deeptutor/api/main.py`
  - register the graph timeline router
- Modify: `deeptutor/api/routers/sessions.py`
  - emit `quiz_*` and `remediation_*` timeline events at graph quiz transitions
- Modify: `deeptutor/api/routers/node_progress.py`
  - emit `node_started` and `node_mastered` events from node-progress transitions if they do not already exist in the quiz path
- Modify: `deeptutor/api/routers/graph_recommendation.py`
  - emit `recommendation_changed` only when target, mode, or primary reason codes change meaningfully
- Create: `tests/api/routers/test_graph_timeline.py`
  - endpoint coverage and filtering behavior
- Modify: `tests/services/session/test_sqlite_store.py`
  - persistence coverage for write/read ordering and filters
- Modify: `tests/api/routers/test_sessions_graph_quiz.py`
  - verify quiz/remediation timeline emission
- Modify: `tests/api/routers/test_graph_recommendation.py`
  - verify recommendation-change event creation rules

### Frontend timeline data and UI

- Create: `web/lib/graph-timeline-api.ts`
  - typed fetch helper for timeline reads with `category`, `node_id`, and `limit`
- Create: `web/lib/graph-timeline-ui.ts`
  - category labels, icons, reason-tag copy, grouped-day formatting, and expert detail rendering helpers
- Create: `web/components/graph/LearningTimelineDrawer.tsx`
  - collapsible drawer, grouped event list, filter chips, detail expansion, and light actions
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - load timeline data, mount the drawer, handle node focus and action callbacks, and deep-link open/focus state
- Modify: `web/components/graph/NodeDetailPanel.tsx`
  - add entry point to open timeline focused on current node
- Modify: `web/lib/graph-recommendation-ui.ts`
  - add timeline entry CTA copy for recommendation cards
- Modify: `web/components/quiz/QuizViewer.tsx`
  - surface timeline entry CTA in failed/pass/remediation milestone blocks
- Create: `web/tests/graph-timeline-ui.test.ts`
  - formatter and grouping expectations
- Create: `web/tests/learning-timeline-drawer.test.tsx`
  - drawer filtering, detail expansion, and action callbacks
- Modify: `web/tests/graph-recommendation-ui.test.ts`
  - recommendation CTA expectations

## Task 1: Add typed timeline models and deterministic event builders

**Files:**
- Modify: `deeptutor/services/graph/models.py`
- Create: `deeptutor/services/graph/timeline.py`
- Create: `tests/services/graph/test_timeline.py`

- [ ] **Step 1: Write the failing timeline domain tests**

```python
from deeptutor.services.graph.models import LearningTimelineEvent
from deeptutor.services.graph.timeline import (
    build_learning_event,
    should_emit_recommendation_event,
)


def test_build_learning_event_preserves_summary_tags_and_actions() -> None:
    event = build_learning_event(
        event_id="evt_1",
        session_id="session_1",
        course_id="oop_course",
        node_id="oop_intro",
        category="quiz",
        event_type="quiz_failed",
        summary="Bạn chưa vượt qua quiz của node này.",
        reason_tags=["recent_weakness", "remediation_active"],
        details={"score_ratio": 0.4, "failure_severity": "severe"},
        actions=[{"kind": "start_remediation", "label": "Ôn lại phần yếu"}],
        highlighted=True,
        created_at="2026-04-29T09:00:00Z",
    )

    assert isinstance(event, LearningTimelineEvent)
    assert event.category == "quiz"
    assert event.reason_tags == ["recent_weakness", "remediation_active"]
    assert event.actions[0].kind == "start_remediation"
    assert event.highlighted is True


def test_should_emit_recommendation_event_requires_meaningful_change() -> None:
    previous = {
        "recommended_node_id": "oop_intro",
        "mode": "next_step",
        "reason_codes": ["prerequisite_ready"],
    }
    current = {
        "recommended_node_id": "oop_intro",
        "mode": "next_step",
        "reason_codes": ["prerequisite_ready"],
    }
    changed = {
        "recommended_node_id": "oop_review",
        "mode": "remediate",
        "reason_codes": ["recent_quiz_weakness"],
    }

    assert should_emit_recommendation_event(previous, current) is False
    assert should_emit_recommendation_event(previous, changed) is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_timeline.py -v`
Expected: FAIL with `ImportError` or `AttributeError` because the timeline models and helpers do not exist yet.

- [ ] **Step 3: Add minimal timeline models and builders**

```python
# deeptutor/services/graph/models.py
LearningTimelineCategory = Literal["node", "quiz", "remediation", "recommendation"]
LearningTimelineEventType = Literal[
    "node_started",
    "node_mastered",
    "quiz_failed",
    "quiz_passed",
    "remediation_recommended",
    "remediation_started",
    "remediation_mini_quiz_passed",
    "remediation_completed",
    "recommendation_changed",
]
LearningTimelineReasonTag = Literal[
    "prerequisite_ready",
    "recent_weakness",
    "retry_passed",
    "remediation_active",
    "remediation_cleared",
    "advanced_to_next",
    "manual_retry",
]
LearningTimelineActionKind = Literal[
    "focus_node",
    "open_node_detail",
    "retry_quiz",
    "start_remediation",
    "open_recommendation_target",
]


class LearningTimelineAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: LearningTimelineActionKind
    label: str
    payload: dict[str, object] = Field(default_factory=dict)


class LearningTimelineEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    session_id: str
    course_id: str
    node_id: str = ""
    category: LearningTimelineCategory
    event_type: LearningTimelineEventType
    created_at: str
    summary: str
    reason_tags: list[LearningTimelineReasonTag] = Field(default_factory=list)
    details: dict[str, object] = Field(default_factory=dict)
    actions: list[LearningTimelineAction] = Field(default_factory=list)
    highlighted: bool = False
```

```python
# deeptutor/services/graph/timeline.py
from __future__ import annotations

from deeptutor.services.graph.models import LearningTimelineAction, LearningTimelineEvent


def build_learning_event(
    *,
    event_id: str,
    session_id: str,
    course_id: str,
    node_id: str,
    category: str,
    event_type: str,
    summary: str,
    reason_tags: list[str],
    details: dict[str, object],
    actions: list[dict[str, object]],
    highlighted: bool,
    created_at: str,
) -> LearningTimelineEvent:
    return LearningTimelineEvent.model_validate(
        {
            "event_id": event_id,
            "session_id": session_id,
            "course_id": course_id,
            "node_id": node_id,
            "category": category,
            "event_type": event_type,
            "summary": summary,
            "reason_tags": reason_tags,
            "details": details,
            "actions": [LearningTimelineAction.model_validate(action) for action in actions],
            "highlighted": highlighted,
            "created_at": created_at,
        }
    )


def should_emit_recommendation_event(
    previous: dict[str, object] | None,
    current: dict[str, object] | None,
) -> bool:
    if not current:
        return False
    if not previous:
        return True
    return (
        previous.get("recommended_node_id") != current.get("recommended_node_id")
        or previous.get("mode") != current.get("mode")
        or list(previous.get("reason_codes") or []) != list(current.get("reason_codes") or [])
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/graph/test_timeline.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/models.py deeptutor/services/graph/timeline.py tests/services/graph/test_timeline.py
git commit -m "feat: add learning timeline event models"
```

## Task 2: Persist timeline events and expose a read API

**Files:**
- Modify: `deeptutor/services/session/sqlite_store.py`
- Create: `deeptutor/api/routers/graph_timeline.py`
- Modify: `deeptutor/api/main.py`
- Create: `tests/api/routers/test_graph_timeline.py`
- Modify: `tests/services/session/test_sqlite_store.py`

- [ ] **Step 1: Write the failing persistence and router tests**

```python
from fastapi.testclient import TestClient


def test_sqlite_store_reads_timeline_events_with_filters(store) -> None:
    store.append_learning_timeline_event(
        {
            "event_id": "evt_1",
            "session_id": "session_1",
            "course_id": "oop_course",
            "node_id": "oop_intro",
            "category": "quiz",
            "event_type": "quiz_failed",
            "created_at": "2026-04-29T09:00:00Z",
            "summary": "Quiz failed",
        }
    )
    store.append_learning_timeline_event(
        {
            "event_id": "evt_2",
            "session_id": "session_1",
            "course_id": "oop_course",
            "node_id": "oop_intro",
            "category": "remediation",
            "event_type": "remediation_started",
            "created_at": "2026-04-29T09:05:00Z",
            "summary": "Remediation started",
        }
    )

    events = store.get_learning_timeline("oop_course", category="remediation", node_id="oop_intro")
    assert [event["event_id"] for event in events] == ["evt_2"]


def test_graph_timeline_route_returns_reverse_chronological_events(client: TestClient) -> None:
    response = client.get("/api/v1/graph/timeline/oop_course")

    assert response.status_code == 200
    payload = response.json()
    assert payload["events"][0]["event_id"] == "evt_2"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py -k learning_timeline tests/api/routers/test_graph_timeline.py -v`
Expected: FAIL because timeline persistence methods and router do not exist yet.

- [ ] **Step 3: Add store methods and router**

```python
# deeptutor/services/session/sqlite_store.py
def append_learning_timeline_event(self, event: dict[str, object]) -> bool:
    event_id = str(event.get("event_id") or "").strip()
    course_id = str(event.get("course_id") or "").strip()
    created_at = str(event.get("created_at") or "").strip()
    if not event_id or not course_id or not created_at:
        return False
    with self._connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS learning_timeline_events (
                event_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                course_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                category TEXT NOT NULL,
                event_type TEXT NOT NULL,
                summary TEXT NOT NULL,
                reason_tags_json TEXT NOT NULL,
                details_json TEXT NOT NULL,
                actions_json TEXT NOT NULL,
                highlighted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO learning_timeline_events (
                event_id, session_id, course_id, node_id, category, event_type,
                summary, reason_tags_json, details_json, actions_json, highlighted, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                str(event.get("session_id") or ""),
                course_id,
                str(event.get("node_id") or ""),
                str(event.get("category") or ""),
                str(event.get("event_type") or ""),
                str(event.get("summary") or ""),
                json.dumps(event.get("reason_tags") or []),
                json.dumps(event.get("details") or {}),
                json.dumps(event.get("actions") or []),
                1 if event.get("highlighted") else 0,
                created_at,
            ),
        )
        return True


def get_learning_timeline(
    self,
    course_id: str,
    *,
    category: str = "",
    node_id: str = "",
    limit: int = 50,
) -> list[dict[str, object]]:
    clauses = ["course_id = ?"]
    params: list[object] = [course_id]
    if category:
        clauses.append("category = ?")
        params.append(category)
    if node_id:
        clauses.append("node_id = ?")
        params.append(node_id)
    params.append(max(1, min(limit, 200)))
    query = f"""
        SELECT event_id, session_id, course_id, node_id, category, event_type, summary,
               reason_tags_json, details_json, actions_json, highlighted, created_at
        FROM learning_timeline_events
        WHERE {' AND '.join(clauses)}
        ORDER BY created_at DESC
        LIMIT ?
    """
    with self._connect() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [
        {
            "event_id": row["event_id"],
            "session_id": row["session_id"],
            "course_id": row["course_id"],
            "node_id": row["node_id"],
            "category": row["category"],
            "event_type": row["event_type"],
            "summary": row["summary"],
            "reason_tags": json.loads(row["reason_tags_json"] or "[]"),
            "details": json.loads(row["details_json"] or "{}"),
            "actions": json.loads(row["actions_json"] or "[]"),
            "highlighted": bool(row["highlighted"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]
```

```python
# deeptutor/api/routers/graph_timeline.py
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/v1/graph/timeline", tags=["graph-timeline"])


@router.get("/{course_id}")
def get_graph_timeline(
    course_id: str,
    category: str = Query(default=""),
    node_id: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, object]:
    store = get_sqlite_store()
    return {
        "course_id": course_id,
        "events": store.get_learning_timeline(
            course_id,
            category=category,
            node_id=node_id,
            limit=limit,
        ),
    }
```

- [ ] **Step 4: Register the router and rerun tests**

```python
# deeptutor/api/main.py
from deeptutor.api.routers import graph_timeline

app.include_router(graph_timeline.router)
```

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py -k learning_timeline tests/api/routers/test_graph_timeline.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/session/sqlite_store.py deeptutor/api/routers/graph_timeline.py deeptutor/api/main.py tests/services/session/test_sqlite_store.py tests/api/routers/test_graph_timeline.py
git commit -m "feat: add graph learning timeline API"
```

## Task 3: Emit timeline events from graph progress, quiz, remediation, and recommendation flows

**Files:**
- Modify: `deeptutor/api/routers/sessions.py`
- Modify: `deeptutor/api/routers/node_progress.py`
- Modify: `deeptutor/api/routers/graph_recommendation.py`
- Modify: `tests/api/routers/test_sessions_graph_quiz.py`
- Modify: `tests/api/routers/test_graph_recommendation.py`

- [ ] **Step 1: Write the failing event-emission tests**

```python
def test_failed_graph_quiz_appends_quiz_and_remediation_events(client) -> None:
    response = client.post(
        "/api/v1/sessions/session_1/quiz-results",
        json={
            "course_id": "oop_course",
            "results": [
                {
                    "question_id": "q1",
                    "correct": False,
                    "graph_context": {
                        "course_id": "oop_course",
                        "node_id": "oop_intro",
                        "quiz_kind": "node_quiz",
                    },
                }
            ],
        },
    )

    assert response.status_code == 200
    timeline = client.get("/api/v1/graph/timeline/oop_course").json()["events"]
    assert [event["event_type"] for event in timeline[:2]] == ["remediation_recommended", "quiz_failed"]


def test_recommendation_route_only_logs_meaningful_changes(client) -> None:
    first = client.get("/api/v1/graph/recommendation/oop_course").status_code
    second = client.get("/api/v1/graph/recommendation/oop_course").status_code

    assert first == 200
    assert second == 200
    timeline = client.get("/api/v1/graph/timeline/oop_course?category=recommendation").json()["events"]
    assert len(timeline) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py -k timeline -v`
Expected: FAIL because the existing routers do not append timeline events yet.

- [ ] **Step 3: Append deterministic timeline events in each transition point**

```python
# deeptutor/api/routers/sessions.py
quiz_event = build_learning_event(
    event_id=f"quiz:{session_id}:{node_id}:{submitted_at}",
    session_id=session_id,
    course_id=course_id,
    node_id=node_id,
    category="quiz",
    event_type="quiz_passed" if passed else "quiz_failed",
    summary=(
        "Bạn đã vượt qua quiz của node này."
        if passed
        else "Bạn chưa vượt qua quiz của node này."
    ),
    reason_tags=["retry_passed"] if passed and is_retry else ["recent_weakness"] if not passed else [],
    details={
        "score_ratio": score_ratio,
        "pass_threshold": pass_threshold,
        "quiz_kind": quiz_kind,
    },
    actions=[{"kind": "retry_quiz", "label": "Làm lại quiz", "payload": {"node_id": node_id}}] if not passed else [],
    highlighted=True,
    created_at=submitted_at,
)
store.append_learning_timeline_event(quiz_event.model_dump())

if remediation_created:
    remediation_event = build_learning_event(
        event_id=f"remediation:{session_id}:{node_id}:{submitted_at}",
        session_id=session_id,
        course_id=course_id,
        node_id=target_node_id,
        category="remediation",
        event_type="remediation_recommended",
        summary="Hệ thống đề xuất ôn lại phần nền tảng trước khi tiếp tục.",
        reason_tags=["recent_weakness", "remediation_active"],
        details={
            "source_node_id": node_id,
            "target_node_id": target_node_id,
            "failure_severity": failure_severity,
        },
        actions=[{"kind": "start_remediation", "label": "Ôn lại phần yếu", "payload": {"node_id": target_node_id}}],
        highlighted=True,
        created_at=submitted_at,
    )
    store.append_learning_timeline_event(remediation_event.model_dump())
```

```python
# deeptutor/api/routers/graph_recommendation.py
if should_emit_recommendation_event(previous_recommendation, current_recommendation):
    event = build_learning_event(
        event_id=f"recommendation:{course_id}:{now_iso}",
        session_id=session_id,
        course_id=course_id,
        node_id=str(current_recommendation.get("recommended_node_id") or ""),
        category="recommendation",
        event_type="recommendation_changed",
        summary=recommendation_summary_for_timeline(current_recommendation),
        reason_tags=list(current_recommendation.get("reason_codes") or []),
        details={
            "recommendation_mode": current_recommendation.get("mode"),
            "recommended_node_id": current_recommendation.get("recommended_node_id"),
            "backup_node_ids": list(current_recommendation.get("backup_node_ids") or []),
            "reason_codes": list(current_recommendation.get("reason_codes") or []),
        },
        actions=[{"kind": "open_recommendation_target", "label": "Đi tới bước được đề xuất", "payload": {"node_id": current_recommendation.get("recommended_node_id")}}],
        highlighted=True,
        created_at=now_iso,
    )
    store.append_learning_timeline_event(event.model_dump())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py -k timeline -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/sessions.py deeptutor/api/routers/node_progress.py deeptutor/api/routers/graph_recommendation.py tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py
git commit -m "feat: emit learning timeline events"
```

## Task 4: Add timeline API helpers and deterministic frontend formatters

**Files:**
- Create: `web/lib/graph-timeline-api.ts`
- Create: `web/lib/graph-timeline-ui.ts`
- Create: `web/tests/graph-timeline-ui.test.ts`

- [ ] **Step 1: Write the failing formatter tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  getTimelineCategoryLabel,
  getTimelineReasonTagLabel,
  groupTimelineEventsByDay,
} from "@/lib/graph-timeline-ui";

test("groupTimelineEventsByDay groups events under the same YYYY-MM-DD bucket", () => {
  const groups = groupTimelineEventsByDay([
    { event_id: "evt_2", created_at: "2026-04-29T09:05:00Z", summary: "B" },
    { event_id: "evt_1", created_at: "2026-04-29T09:00:00Z", summary: "A" },
  ] as never[]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.dayKey, "2026-04-29");
  assert.equal(groups[0]?.events.length, 2);
});

test("timeline labels map categories and reason tags to user-facing copy", () => {
  assert.equal(getTimelineCategoryLabel("quiz"), "Quiz");
  assert.equal(getTimelineReasonTagLabel("recent_weakness"), "Còn yếu gần đây");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/graph-timeline-ui.test.ts`
Expected: FAIL because the formatter module does not exist yet.

- [ ] **Step 3: Add typed API module and formatter helpers**

```ts
// web/lib/graph-timeline-api.ts
export type GraphTimelineCategory = "node" | "quiz" | "remediation" | "recommendation";
export type GraphTimelineReasonTag =
  | "prerequisite_ready"
  | "recent_weakness"
  | "retry_passed"
  | "remediation_active"
  | "remediation_cleared"
  | "advanced_to_next"
  | "manual_retry";

export interface GraphTimelineAction {
  kind: "focus_node" | "open_node_detail" | "retry_quiz" | "start_remediation" | "open_recommendation_target";
  label: string;
  payload?: Record<string, unknown>;
}

export interface GraphTimelineEvent {
  event_id: string;
  session_id: string;
  course_id: string;
  node_id: string;
  category: GraphTimelineCategory;
  event_type: string;
  created_at: string;
  summary: string;
  reason_tags: GraphTimelineReasonTag[];
  details: Record<string, unknown>;
  actions: GraphTimelineAction[];
  highlighted: boolean;
}

export async function getGraphTimeline(
  courseId: string,
  options: { category?: string; nodeId?: string; limit?: number } = {},
): Promise<GraphTimelineEvent[]> {
  const params = new URLSearchParams();
  if (options.category) params.set("category", options.category);
  if (options.nodeId) params.set("node_id", options.nodeId);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  const response = await fetch(`/api/v1/graph/timeline/${courseId}${query ? `?${query}` : ""}`);
  if (!response.ok) {
    return [];
  }
  const payload = await response.json();
  return Array.isArray(payload.events) ? payload.events : [];
}
```

```ts
// web/lib/graph-timeline-ui.ts
import type { GraphTimelineCategory, GraphTimelineEvent, GraphTimelineReasonTag } from "@/lib/graph-timeline-api";

const CATEGORY_LABELS: Record<GraphTimelineCategory, string> = {
  node: "Node",
  quiz: "Quiz",
  remediation: "Remediation",
  recommendation: "Recommendation",
};

const REASON_LABELS: Record<GraphTimelineReasonTag, string> = {
  prerequisite_ready: "Đủ điều kiện tiên quyết",
  recent_weakness: "Còn yếu gần đây",
  retry_passed: "Đã vượt qua sau khi làm lại",
  remediation_active: "Đang cần ôn lại",
  remediation_cleared: "Đã hoàn thành ôn lại",
  advanced_to_next: "Tiến sang bước mới",
  manual_retry: "Người học chủ động làm lại",
};

export function getTimelineCategoryLabel(category: GraphTimelineCategory): string {
  return CATEGORY_LABELS[category];
}

export function getTimelineReasonTagLabel(tag: GraphTimelineReasonTag): string {
  return REASON_LABELS[tag];
}

export function groupTimelineEventsByDay(events: GraphTimelineEvent[]) {
  const groups = new Map<string, GraphTimelineEvent[]>();
  for (const event of events) {
    const dayKey = event.created_at.slice(0, 10);
    const bucket = groups.get(dayKey) ?? [];
    bucket.push(event);
    groups.set(dayKey, bucket);
  }
  return Array.from(groups.entries()).map(([dayKey, groupedEvents]) => ({
    dayKey,
    events: groupedEvents,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/graph-timeline-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/graph-timeline-api.ts web/lib/graph-timeline-ui.ts web/tests/graph-timeline-ui.test.ts
git commit -m "feat: add graph timeline frontend helpers"
```

## Task 5: Build the learning timeline drawer UI

**Files:**
- Create: `web/components/graph/LearningTimelineDrawer.tsx`
- Create: `web/tests/learning-timeline-drawer.test.tsx`

- [ ] **Step 1: Write the failing drawer tests**

```tsx
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import LearningTimelineDrawer from "@/components/graph/LearningTimelineDrawer";

test("drawer is collapsed by default and renders filter labels when expanded", () => {
  const collapsed = renderToStaticMarkup(
    <LearningTimelineDrawer events={[]} onAction={() => {}} onSelectNode={() => {}} />
  );
  assert.match(collapsed, /Learning Timeline/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/learning-timeline-drawer.test.tsx`
Expected: FAIL because the drawer component does not exist yet.

- [ ] **Step 3: Add the drawer component**

```tsx
// web/components/graph/LearningTimelineDrawer.tsx
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { GraphTimelineAction, GraphTimelineCategory, GraphTimelineEvent } from "@/lib/graph-timeline-api";
import { getTimelineCategoryLabel, getTimelineReasonTagLabel, groupTimelineEventsByDay } from "@/lib/graph-timeline-ui";

const FILTERS: Array<"all" | GraphTimelineCategory> = ["all", "node", "quiz", "remediation", "recommendation"];

export default function LearningTimelineDrawer({
  events,
  onAction,
  onSelectNode,
}: {
  events: GraphTimelineEvent[];
  onAction: (action: GraphTimelineAction, event: GraphTimelineEvent) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [filter, setFilter] = useState<"all" | GraphTimelineCategory>("all");
  const [expandedEventId, setExpandedEventId] = useState("");

  const filtered = useMemo(
    () => events.filter((event) => filter === "all" || event.category === filter),
    [events, filter],
  );
  const groups = groupTimelineEventsByDay(filtered);

  return (
    <aside className={`absolute top-20 left-4 z-10 flex max-h-[calc(100%-6rem)] transition-all duration-200 ${collapsed ? "w-16" : "w-96"}`}>
      <button
        onClick={() => setCollapsed((value) => !value)}
        className="flex shrink-0 flex-col items-center justify-between rounded-r-2xl border border-l-0 border-slate-200 bg-white/95 px-2 py-3 text-slate-600 shadow-sm backdrop-blur"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] [writing-mode:vertical-rl]">Learning Timeline</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{events.length}</span>
      </button>
      {!collapsed ? (
        <div className="min-w-0 flex-1 overflow-y-auto rounded-l-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <h2 className="text-sm font-semibold text-slate-900">Learning Timeline</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${filter === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {value === "all" ? "All" : getTimelineCategoryLabel(value)}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-4">
            {groups.map((group) => (
              <section key={group.dayKey}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.dayKey}</h3>
                <div className="mt-2 space-y-2">
                  {group.events.map((event) => (
                    <div key={event.event_id} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold">{event.summary}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {event.reason_tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                                {getTimelineReasonTagLabel(tag)}
                              </span>
                            ))}
                          </div>
                        </div>
                        {event.node_id ? (
                          <button onClick={() => onSelectNode(event.node_id)} className="text-[11px] font-medium text-sky-700">
                            Xem node
                          </button>
                        ) : null}
                      </div>
                      {event.actions.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {event.actions.map((action) => (
                            <button key={action.kind} onClick={() => onAction(action, event)} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-700">
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <button
                        onClick={() => setExpandedEventId((current) => (current === event.event_id ? "" : event.event_id))}
                        className="mt-2 text-[11px] font-medium text-slate-500"
                      >
                        {expandedEventId === event.event_id ? "Ẩn chi tiết" : "Xem chi tiết"}
                      </button>
                      {expandedEventId === event.event_id ? (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/learning-timeline-drawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/components/graph/LearningTimelineDrawer.tsx web/tests/learning-timeline-drawer.test.tsx
git commit -m "feat: add learning timeline drawer"
```

## Task 6: Integrate the drawer into graph, recommendation, node detail, and quiz milestone flows

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/NodeDetailPanel.tsx`
- Modify: `web/lib/graph-recommendation-ui.ts`
- Modify: `web/components/quiz/QuizViewer.tsx`
- Modify: `web/tests/graph-recommendation-ui.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { getGraphRecommendationPrimaryCtaLabel } from "@/lib/graph-recommendation-ui";

test("recommendation copy offers a timeline explainer CTA", () => {
  assert.equal(
    getGraphRecommendationPrimaryCtaLabel({
      mode: "remediate",
      reason_codes: ["recent_quiz_weakness"],
    } as never),
    "Ôn lại phần yếu",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts`
Expected: FAIL because the new CTA and timeline entry copy are not wired yet.

- [ ] **Step 3: Mount the drawer and wire entry points**

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx
const [timelineEvents, setTimelineEvents] = useState<GraphTimelineEvent[]>([]);
const [timelineNodeFilter, setTimelineNodeFilter] = useState("");

async function refreshTimeline(category = "", nodeId = "") {
  if (!courseId) return;
  const events = await getGraphTimeline(courseId, { category, nodeId, limit: 100 });
  setTimelineEvents(events);
}

useEffect(() => {
  void refreshTimeline("", selectedNodeId ?? "");
}, [courseId, selectedNodeId]);

function handleTimelineAction(action: GraphTimelineAction) {
  const actionNodeId = String(action.payload?.node_id || "");
  if (action.kind === "focus_node" || action.kind === "open_recommendation_target") {
    setSelectedNodeId(actionNodeId);
    return;
  }
  if (action.kind === "start_remediation") {
    void startRemediationFromNode(actionNodeId);
    return;
  }
  if (action.kind === "retry_quiz") {
    void startNodeQuiz(actionNodeId);
  }
}
```

```tsx
// web/components/graph/NodeDetailPanel.tsx
<button
  onClick={() => onOpenTimeline?.(node.node_id)}
  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
>
  Xem learning timeline
</button>
```

```tsx
// web/components/quiz/QuizViewer.tsx
{isGraphLinkedQuiz && lastGraphOutcome ? (
  <button
    onClick={() => onOpenTimeline?.(lastGraphOutcome.nodeId)}
    className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700"
  >
    Mở learning timeline
  </button>
) : null}
```

- [ ] **Step 4: Run focused frontend tests**

Run: `node --experimental-strip-types --test web/tests/graph-timeline-ui.test.ts web/tests/learning-timeline-drawer.test.tsx web/tests/graph-recommendation-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx web/lib/graph-recommendation-ui.ts web/components/quiz/QuizViewer.tsx web/tests/graph-recommendation-ui.test.ts
git commit -m "feat: integrate learning timeline into graph flows"
```

## Task 7: Run end-to-end verification and document residual risks

**Files:**
- Modify: `docs/superpowers/plans/2026-04-29-learning-timeline-explainability.md`
  - mark completed checkboxes during execution only

- [ ] **Step 1: Run backend verification**

Run: `.venv/bin/python -m pytest tests/services/graph/test_timeline.py tests/services/session/test_sqlite_store.py tests/api/routers/test_graph_timeline.py tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py -q`
Expected: PASS

- [ ] **Step 2: Run frontend verification**

Run: `node --experimental-strip-types --test web/tests/graph-timeline-ui.test.ts web/tests/learning-timeline-drawer.test.tsx web/tests/graph-recommendation-ui.test.ts`
Expected: PASS

- [ ] **Step 3: Smoke check critical UX paths**

```text
1. Open Knowledge Graph and confirm Learning Timeline drawer is collapsed by default.
2. Fail a graph-linked node quiz and confirm the timeline shows quiz_failed and remediation_recommended.
3. Start remediation and confirm the timeline shows remediation_started.
4. Pass remediation mini-quiz and confirm the timeline shows remediation_mini_quiz_passed.
5. Pass the main node quiz and confirm the timeline shows remediation_completed and node_mastered.
6. Trigger a meaningful recommendation change and confirm recommendation_changed appears once.
```

- [ ] **Step 4: Commit final polish**

```bash
git add deeptutor/services/graph/models.py deeptutor/services/graph/timeline.py deeptutor/services/session/sqlite_store.py deeptutor/api/routers/graph_timeline.py deeptutor/api/main.py deeptutor/api/routers/sessions.py deeptutor/api/routers/node_progress.py deeptutor/api/routers/graph_recommendation.py web/lib/graph-timeline-api.ts web/lib/graph-timeline-ui.ts web/components/graph/LearningTimelineDrawer.tsx web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx web/lib/graph-recommendation-ui.ts web/components/quiz/QuizViewer.tsx tests/services/graph/test_timeline.py tests/services/session/test_sqlite_store.py tests/api/routers/test_graph_timeline.py tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py web/tests/graph-timeline-ui.test.ts web/tests/learning-timeline-drawer.test.tsx web/tests/graph-recommendation-ui.test.ts
git commit -m "feat: add learning timeline explainability"
```
