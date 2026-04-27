# Adaptive Next-Step Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-course adaptive next-step recommendation system that ranks the best next Knowledge Graph node for a student, exposes it through an API, and surfaces it in the workspace graph UI.

**Architecture:** Keep recommendation as a deterministic backend graph service, not an LLM workflow. The backend computes candidate nodes from the imported course graph plus student progress state, applies rule-based guardrails, ranks eligible nodes with weighted scoring, and returns a compact response with recommendation mode and reason codes. The frontend fetches that response, highlights the recommended node, and shows explanation affordances in the graph panel without changing the underlying graph import pipeline.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session store, pytest, TypeScript, React/Next.js, `@xyflow/react`, Node test runner

---

## File Structure

### Backend recommendation domain

- Create: `deeptutor/services/graph/recommendation.py`
  - Core recommendation service, candidate filtering, scoring, mode resolution, response assembly
- Modify: `deeptutor/services/graph/models.py`
  - Add typed recommendation response models and reason/mode literals near the graph domain models
- Create: `tests/services/graph/test_recommendation.py`
  - Unit tests for guardrails, scoring, remediation, and repeat suppression

### Backend API

- Create: `deeptutor/api/routers/graph_recommendation.py`
  - Read-only route: `GET /api/v1/graph/recommendation/{course_id}?session_id=...`
- Modify: `deeptutor/api/main.py`
  - Import and register the new router
- Create: `tests/api/routers/test_graph_recommendation.py`
  - API coverage for recommendation response shape and fallback behavior

### Frontend recommendation integration

- Modify: `web/lib/course-knowledge-graph.ts`
  - Allow node mapping to carry recommendation styling hints and flags
- Create: `web/lib/graph-recommendation-api.ts`
  - Fetch helper for the new backend route
- Create: `web/lib/graph-recommendation-ui.ts`
  - Small frontend formatter for reason codes and recommendation card copy
- Modify: `web/components/graph/NodeDetailPanel.tsx`
  - Add recommendation-aware copy and action affordance
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - Fetch recommendation, highlight the node, and render a small recommendation card
- Create: `web/tests/graph-recommendation-ui.test.ts`
  - Verify reason-code formatting and recommendation card behavior
- Modify: `web/tests/course-knowledge-graph.test.ts`
  - Verify recommended node styling hints are preserved by graph mapping

## Task 1: Add backend recommendation models

**Files:**
- Modify: `deeptutor/services/graph/models.py`
- Create: `tests/services/graph/test_recommendation.py`

- [ ] **Step 1: Write the failing model validation test**

```python
from deeptutor.services.graph.models import GraphRecommendation


def test_graph_recommendation_defaults_backup_nodes_and_reason_codes() -> None:
    recommendation = GraphRecommendation.model_validate(
        {
            "recommended_node_id": "topic_search",
            "mode": "advance",
            "score": 0.78,
        }
    )

    assert recommendation.recommended_node_id == "topic_search"
    assert recommendation.mode == "advance"
    assert recommendation.reason_codes == []
    assert recommendation.backup_node_ids == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py::test_graph_recommendation_defaults_backup_nodes_and_reason_codes -v`
Expected: FAIL with `ImportError` or `AttributeError` because `GraphRecommendation` does not exist yet.

- [ ] **Step 3: Write minimal recommendation models**

```python
from typing import Literal

RecommendationMode = Literal["advance", "review", "remediate"]
RecommendationReasonCode = Literal[
    "prerequisites_ready",
    "high_unlock_value",
    "close_to_current_path",
    "recent_quiz_weakness",
    "needs_review_before_advance",
]


class GraphRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommended_node_id: str
    mode: RecommendationMode
    score: float = Field(ge=0.0, le=1.0)
    reason_codes: list[RecommendationReasonCode] = Field(default_factory=list)
    backup_node_ids: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py::test_graph_recommendation_defaults_backup_nodes_and_reason_codes -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/models.py tests/services/graph/test_recommendation.py
git commit -m "feat: add graph recommendation models"
```

## Task 2: Implement recommendation service with guardrails and scoring

**Files:**
- Create: `deeptutor/services/graph/recommendation.py`
- Modify: `tests/services/graph/test_recommendation.py`

- [ ] **Step 1: Write the failing service tests**

```python
from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation
from deeptutor.services.graph.recommendation import recommend_next_graph_node


def build_graph() -> CourseKnowledgeGraph:
    return CourseKnowledgeGraph.model_validate(
        {
            "course_id": "intro-ai",
            "title": "Intro to AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "topic_intro", "title": "Intro", "node_type": "topic"},
                {"node_id": "topic_search", "title": "Search", "node_type": "topic"},
                {"node_id": "topic_planning", "title": "Planning", "node_type": "topic"},
            ],
            "edges": [
                {
                    "edge_id": "edge_intro_search",
                    "source": "topic_intro",
                    "target": "topic_search",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                },
                {
                    "edge_id": "edge_search_planning",
                    "source": "topic_search",
                    "target": "topic_planning",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                },
            ],
            "audit": {
                "backbone_node_ids": ["topic_intro", "topic_search", "topic_planning"],
                "enriched_node_ids": [],
                "backbone_edge_ids": ["edge_intro_search", "edge_search_planning"],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )


def test_recommend_next_graph_node_prefers_first_reachable_unmastered_topic() -> None:
    recommendation = recommend_next_graph_node(
        graph=build_graph(),
        student_state={
            "current_node_id": "topic_intro",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": [],
        },
    )

    assert recommendation.recommended_node_id == "topic_search"
    assert recommendation.mode == "advance"
    assert "prerequisites_ready" in recommendation.reason_codes


def test_recommend_next_graph_node_switches_to_review_when_only_explored_nodes_remain() -> None:
    recommendation = recommend_next_graph_node(
        graph=build_graph(),
        student_state={
            "current_node_id": "topic_planning",
            "mastered_nodes": ["topic_intro", "topic_search"],
            "explored_nodes": ["topic_planning"],
        },
    )

    assert recommendation.recommended_node_id == "topic_planning"
    assert recommendation.mode == "review"
    assert "needs_review_before_advance" in recommendation.reason_codes
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py -v`
Expected: FAIL with `ImportError` because `recommend_next_graph_node` does not exist yet.

- [ ] **Step 3: Write minimal recommendation service**

```python
from __future__ import annotations

from collections import defaultdict

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation


def recommend_next_graph_node(
    *,
    graph: CourseKnowledgeGraph,
    student_state: dict[str, object],
) -> GraphRecommendation:
    mastered = set(student_state.get("mastered_nodes", []) or [])
    explored = set(student_state.get("explored_nodes", []) or [])
    current_node_id = str(student_state.get("current_node_id", "") or "")

    prerequisites: dict[str, set[str]] = defaultdict(set)
    unlock_counts: dict[str, int] = defaultdict(int)
    for edge in graph.edges:
        if edge.relation_type != "prerequisite":
            continue
        prerequisites[edge.target].add(edge.source)
        unlock_counts[edge.source] += 1

    candidates: list[tuple[float, GraphRecommendation]] = []

    for node in graph.nodes:
        if node.node_id in mastered:
            continue

        prereqs = prerequisites.get(node.node_id, set())
        readiness = 1.0 if not prereqs else len(prereqs & mastered) / len(prereqs)
        if prereqs and readiness < 1.0 and node.node_id not in explored:
            continue

        continuity = 1.0 if node.node_id == current_node_id else 0.6
        importance = min(unlock_counts.get(node.node_id, 0) / 3.0, 1.0)

        if node.node_id in explored:
            score = min(0.45 + 0.20 * continuity + 0.10 * importance, 0.99)
            recommendation = GraphRecommendation(
                recommended_node_id=node.node_id,
                mode="review",
                score=score,
                reason_codes=["needs_review_before_advance"],
                backup_node_ids=[],
            )
        else:
            score = min(0.35 * readiness + 0.20 * importance + 0.20 * continuity + 0.25, 0.99)
            reasons = ["prerequisites_ready"]
            if importance > 0:
                reasons.append("high_unlock_value")
            if continuity > 0.5:
                reasons.append("close_to_current_path")
            recommendation = GraphRecommendation(
                recommended_node_id=node.node_id,
                mode="advance",
                score=score,
                reason_codes=reasons,
                backup_node_ids=[],
            )

        candidates.append((recommendation.score, recommendation))

    if not candidates:
        fallback = next(node for node in graph.nodes)
        return GraphRecommendation(
            recommended_node_id=fallback.node_id,
            mode="review",
            score=0.0,
            reason_codes=["needs_review_before_advance"],
            backup_node_ids=[],
        )

    candidates.sort(key=lambda item: item[0], reverse=True)
    primary = candidates[0][1]
    backups = [candidate.recommended_node_id for _, candidate in candidates[1:3]]
    return primary.model_copy(update={"backup_node_ids": backups})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/recommendation.py tests/services/graph/test_recommendation.py
git commit -m "feat: add graph recommendation service"
```

## Task 3: Expose recommendation through a FastAPI router

**Files:**
- Create: `deeptutor/api/routers/graph_recommendation.py`
- Modify: `deeptutor/api/main.py`
- Create: `tests/api/routers/test_graph_recommendation.py`

- [ ] **Step 1: Write the failing router test**

```python
import importlib
import json
from pathlib import Path

import pytest

from deeptutor.services.session.sqlite_store import SQLiteSessionStore

graph_recommendation_module = importlib.import_module("deeptutor.api.routers.graph_recommendation")


@pytest.fixture
def store(tmp_path: Path) -> SQLiteSessionStore:
    return SQLiteSessionStore(db_path=tmp_path / "graph-recommendation.db")


@pytest.mark.anyio
async def test_get_graph_recommendation_returns_next_node(store: SQLiteSessionStore) -> None:
    await store.upsert_course_template(
        "intro-ai",
        json.dumps(
            {
                "course_id": "intro-ai",
                "title": "Intro to AI",
                "source_type": "manual_json",
                "nodes": [
                    {"node_id": "topic_intro", "title": "Intro", "node_type": "topic"},
                    {"node_id": "topic_search", "title": "Search", "node_type": "topic"},
                ],
                "edges": [
                    {
                        "edge_id": "edge_intro_search",
                        "source": "topic_intro",
                        "target": "topic_search",
                        "relation_type": "prerequisite",
                        "confidence": 1.0,
                    }
                ],
                "audit": {
                    "backbone_node_ids": ["topic_intro", "topic_search"],
                    "enriched_node_ids": [],
                    "backbone_edge_ids": ["edge_intro_search"],
                    "enriched_edge_ids": [],
                    "warnings": [],
                },
            }
        ),
    )
    await store.upsert_student_state(
        "session-1",
        "intro-ai",
        {
            "current_node_id": "topic_intro",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": [],
            "dynamic_nodes": [],
        },
    )

    response = await graph_recommendation_module.get_graph_recommendation(
        course_id="intro-ai",
        session_id="session-1",
        store=store,
    )

    assert response.recommended_node_id == "topic_search"
    assert response.mode == "advance"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/api/routers/test_graph_recommendation.py::test_get_graph_recommendation_returns_next_node -v`
Expected: FAIL with `ModuleNotFoundError` because the router file does not exist yet.

- [ ] **Step 3: Write minimal router and register it**

```python
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation
from deeptutor.services.graph.recommendation import recommend_next_graph_node
from deeptutor.services.session.sqlite_store import SQLiteSessionStore, get_sqlite_session_store

router = APIRouter()


@router.get("/graph/recommendation/{course_id}", response_model=GraphRecommendation)
async def get_graph_recommendation(
    course_id: str,
    session_id: str,
    store: SQLiteSessionStore = Depends(get_sqlite_session_store),
) -> GraphRecommendation:
    template = await store.get_course_template(course_id)
    if not template:
        raise HTTPException(status_code=404, detail="Course template not found")

    state = await store.get_student_state(session_id, course_id)
    if not state:
        state = {
            "current_node_id": "",
            "mastered_nodes": [],
            "explored_nodes": [],
            "dynamic_nodes": [],
        }

    graph = CourseKnowledgeGraph.model_validate(json.loads(template["template_json"]))
    return recommend_next_graph_node(graph=graph, student_state=state)
```

Add to `deeptutor/api/main.py`:

```python
from deeptutor.api.routers import graph_recommendation

app.include_router(graph_recommendation.router, prefix="/api/v1", tags=["graph-recommendation"])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/routers/test_graph_recommendation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/graph_recommendation.py deeptutor/api/main.py tests/api/routers/test_graph_recommendation.py
git commit -m "feat: expose graph recommendation api"
```

## Task 4: Add frontend API helper and recommendation UI formatting

**Files:**
- Create: `web/lib/graph-recommendation-api.ts`
- Create: `web/lib/graph-recommendation-ui.ts`
- Create: `web/tests/graph-recommendation-ui.test.ts`

- [ ] **Step 1: Write the failing UI helper tests**

```typescript
import test from "node:test";
import assert from "node:assert/strict";

import { describeGraphRecommendation } from "../lib/graph-recommendation-ui.ts";

test("describeGraphRecommendation formats remediation copy", () => {
  const summary = describeGraphRecommendation({
    recommended_node_id: "topic_intro",
    mode: "remediate",
    score: 0.82,
    reason_codes: ["recent_quiz_weakness"],
    backup_node_ids: ["topic_history"],
  });

  assert.equal(summary.badge, "Review first");
  assert.match(summary.message, /quiz/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` because the helper file does not exist yet.

- [ ] **Step 3: Write minimal frontend helpers**

```typescript
import { apiUrl } from "./api";

export interface GraphRecommendation {
  recommended_node_id: string;
  mode: "advance" | "review" | "remediate";
  score: number;
  reason_codes: string[];
  backup_node_ids: string[];
}

export async function getGraphRecommendation(
  sessionId: string,
  courseId: string,
): Promise<GraphRecommendation | null> {
  const res = await fetch(
    apiUrl(`/api/v1/graph/recommendation/${encodeURIComponent(courseId)}?session_id=${encodeURIComponent(sessionId)}`),
  );
  if (!res.ok) return null;
  return (await res.json()) as GraphRecommendation;
}
```

```typescript
import type { GraphRecommendation } from "./graph-recommendation-api.ts";

export function describeGraphRecommendation(recommendation: GraphRecommendation): {
  badge: string;
  message: string;
} {
  if (recommendation.mode === "remediate") {
    return {
      badge: "Review first",
      message: "You should revisit this prerequisite area before moving forward because recent quiz results indicate weakness here.",
    };
  }
  if (recommendation.mode === "review") {
    return {
      badge: "Review",
      message: "This node has been explored but should be reinforced before advancing further.",
    };
  }
  return {
    badge: "Next",
    message: "This is the strongest next step based on prerequisite readiness and course progression.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/graph-recommendation-api.ts web/lib/graph-recommendation-ui.ts web/tests/graph-recommendation-ui.test.ts
git commit -m "feat: add frontend graph recommendation helpers"
```

## Task 5: Highlight the recommended node in the graph viewer

**Files:**
- Modify: `web/lib/course-knowledge-graph.ts`
- Modify: `web/tests/course-knowledge-graph.test.ts`
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`

- [ ] **Step 1: Write the failing graph mapping test**

```typescript
test("mapCourseKnowledgeGraphToFlow marks the recommended node with styling metadata", () => {
  const flow = mapCourseKnowledgeGraphToFlow(
    {
      course_id: "intro-ai",
      title: "Intro to AI",
      source_type: "manual_json",
      nodes: [
        {
          node_id: "topic_intro",
          title: "Introduction to AI",
          node_type: "topic",
          description: "Overview",
          difficulty: "easy",
          learning_outcomes: [],
          examples: [],
          related_questions: [],
          resources: [],
          source_refs: [],
        },
      ],
      edges: [],
      audit: {
        backbone_node_ids: ["topic_intro"],
        enriched_node_ids: [],
        backbone_edge_ids: [],
        enriched_edge_ids: [],
        warnings: [],
      },
    },
    { recommendedNodeId: "topic_intro" },
  );

  assert.equal(flow.nodes[0].data.isRecommended, true);
  assert.match(String(flow.nodes[0].style?.border), /3px/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts`
Expected: FAIL because `mapCourseKnowledgeGraphToFlow` does not accept recommendation options yet.

- [ ] **Step 3: Update graph mapping and viewer fetch logic**

```typescript
export function mapCourseKnowledgeGraphToFlow(
  graph: CourseKnowledgeGraph,
  options?: { recommendedNodeId?: string | null },
) {
  const recommendedNodeId = options?.recommendedNodeId ?? null;
  ...
  const isRecommended = id === recommendedNodeId;
  return {
    id,
    position: ...,
    data: {
      label: node.title,
      description: node.description ?? "",
      nodeType: node.node_type,
      difficulty: node.difficulty ?? "medium",
      isRecommended,
    },
    type: "default",
    style: isRecommended
      ? {
          border: "3px solid #3b82f6",
          boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.15)",
        }
      : undefined,
  };
}
```

In `KnowledgeGraphViewer.tsx`, add state:

```typescript
const [recommendation, setRecommendation] = useState<GraphRecommendation | null>(null);
```

Update template/progress load effect:

```typescript
const recommendationPromise = shouldLoadProgress && sessionId
  ? getGraphRecommendation(sessionId, courseId)
  : Promise.resolve(null);

Promise.all([templatePromise, progressPromise, recommendationPromise])
  .then(([templateData, progressData, recommendationData]) => {
    setProgressMap(progressData as Record<string, NodeStatus>);
    setRecommendation(recommendationData);
    applyCourseTemplate(
      templateData,
      progressData as Record<string, NodeStatus>,
      recommendationData?.recommended_node_id ?? null,
    );
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/course-knowledge-graph.ts web/components/graph/KnowledgeGraphViewer.tsx web/tests/course-knowledge-graph.test.ts
git commit -m "feat: highlight recommended graph node"
```

## Task 6: Show recommendation copy and actions in the graph panel

**Files:**
- Modify: `web/components/graph/NodeDetailPanel.tsx`
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/tests/graph-recommendation-ui.test.ts`

- [ ] **Step 1: Write the failing UI behavior tests**

```typescript
test("describeGraphRecommendation formats advance copy", () => {
  const summary = describeGraphRecommendation({
    recommended_node_id: "topic_search",
    mode: "advance",
    score: 0.74,
    reason_codes: ["prerequisites_ready", "close_to_current_path"],
    backup_node_ids: [],
  });

  assert.equal(summary.badge, "Next");
  assert.match(summary.message, /prerequisite/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts`
Expected: FAIL because the helper does not format advance-specific explanation richly enough.

- [ ] **Step 3: Update the node panel and recommendation card**

In `KnowledgeGraphViewer.tsx`, render a small recommendation card above the graph:

```tsx
{recommendation ? (
  <div className="absolute top-20 left-4 z-10 w-72 rounded-xl border border-blue-200 bg-white/95 p-3 shadow-sm">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
      {recommendationSummary.badge}
    </div>
    <div className="mt-1 text-sm font-medium text-slate-800">
      {(recommendedNode?.data as Record<string, unknown>)?.label as string}
    </div>
    <p className="mt-1 text-xs leading-relaxed text-slate-600">
      {recommendationSummary.message}
    </p>
  </div>
) : null}
```

In `NodeDetailPanel.tsx`, add props:

```typescript
recommendation?: {
  recommendedNodeId: string;
  badge: string;
  message: string;
};
onJumpToRecommended?: (nodeId: string) => void;
```

And render:

```tsx
{recommendation && recommendation.recommendedNodeId !== node.id ? (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
    <div className="font-semibold">{recommendation.badge}</div>
    <p className="mt-1">{recommendation.message}</p>
    <button
      onClick={() => onJumpToRecommended?.(recommendation.recommendedNodeId)}
      className="mt-2 text-xs font-medium text-amber-900 underline underline-offset-2"
    >
      Go to recommended node
    </button>
  </div>
) : null}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts web/tests/course-knowledge-graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/components/graph/NodeDetailPanel.tsx web/components/graph/KnowledgeGraphViewer.tsx web/tests/graph-recommendation-ui.test.ts
git commit -m "feat: surface next-step recommendation in graph ui"
```

## Task 7: Final verification

**Files:**
- Verify: `deeptutor/services/graph/recommendation.py`
- Verify: `deeptutor/api/routers/graph_recommendation.py`
- Verify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Verify: `web/components/graph/NodeDetailPanel.tsx`

- [ ] **Step 1: Run backend graph recommendation tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py tests/api/routers/test_graph_recommendation.py -q`
Expected: PASS

- [ ] **Step 2: Run existing graph import and viewer tests**

Run: `.venv/bin/python -m pytest tests/api/routers/test_course_templates.py tests/services/graph/test_pipeline.py -q`
Expected: PASS

- [ ] **Step 3: Run frontend graph tests**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/knowledge-graph-course.test.ts web/tests/course-template-import-feedback.test.ts web/tests/graph-recommendation-ui.test.ts`
Expected: PASS

- [ ] **Step 4: Manual workspace verification**

1. Import a course syllabus.
2. Open the workspace before sending any chat message.
3. Confirm the Knowledge Graph still loads.
4. Send one chat message to bind a session.
5. Confirm one graph node is highlighted as recommended.
6. Click a different node and confirm the panel can redirect to the recommended node.
7. Mark a node explored or mastered and confirm recommendation refreshes on the next fetch-triggering action.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/graph_recommendation.py deeptutor/services/graph/recommendation.py web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx web/lib/graph-recommendation-api.ts web/lib/graph-recommendation-ui.ts web/lib/course-knowledge-graph.ts tests/services/graph/test_recommendation.py tests/api/routers/test_graph_recommendation.py web/tests/graph-recommendation-ui.test.ts web/tests/course-knowledge-graph.test.ts
git commit -m "feat: add adaptive next-step recommendation"
```
