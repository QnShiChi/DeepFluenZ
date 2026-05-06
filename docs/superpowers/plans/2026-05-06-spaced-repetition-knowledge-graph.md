# Spaced Repetition on Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add Phase 1 of spaced repetition to the Knowledge Graph by introducing node-level review state, risk-first `review` recommendations, review-aware timeline events, and a review queue in the graph UI.

**Architecture:** Keep this rollout inside the existing graph domain instead of creating a new capability. Persist lightweight node-level review state in the existing student graph state, calculate review candidates through a dedicated graph review service, and let the current recommendation router merge `advance`, `review`, and `remediate` decisions with explainable reason codes and timeline events. The UI should stay node-centric and expose review through the current graph recommendation card, timeline drawer, and a new lightweight queue surface.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session store, pytest, TypeScript, React/Next.js, Node test runner, existing graph recommendation/timeline infrastructure

---

## File Structure

### Backend review state and recommendation

- Modify: `deeptutor/services/graph/models.py`
  - add typed review-state models, review reason codes, and timeline tags/event types for review scheduling
- Create: `deeptutor/services/graph/review.py`
  - calculate node-level review state updates, decay, queue ranking, and reason code selection
- Modify: `deeptutor/services/graph/recommendation.py`
  - combine remediation priority, review priority, and advance scoring in one deterministic recommendation path
- Create: `tests/services/graph/test_review.py`
  - unit coverage for review scheduling, decay, ranking, and fallback behavior
- Modify: `tests/services/graph/test_recommendation.py`
  - cover `review` selection and backup-node behavior when review competes with advance

### Backend API and timeline integration

- Modify: `deeptutor/services/graph/timeline.py`
  - map review recommendation reason codes to learner-facing timeline tags and summaries
- Modify: `deeptutor/api/routers/node_progress.py`
  - update review state from graph activity and expose a `review_queue` snapshot
- Modify: `deeptutor/api/routers/sessions.py`
  - update review state from graph quiz and remediation outcomes before recomputing recommendations
- Modify: `deeptutor/api/routers/graph_recommendation.py`
  - attach `review` details to timeline events and preserve queue-friendly metadata in recommendation details
- Modify: `tests/api/routers/test_node_progress.py`
  - verify review state updates from node activity and `review_queue` exposure
- Modify: `tests/api/routers/test_sessions_graph_quiz.py`
  - verify quiz/remediation outcomes update review state and emit review-aware timeline data
- Modify: `tests/api/routers/test_graph_timeline.py`
  - verify review events and reason tags survive API round-trips

### Frontend contracts and formatting

- Modify: `web/lib/graph-recommendation-api.ts`
  - type optional review metadata returned by the API
- Modify: `web/lib/graph-recommendation-ui.ts`
  - format `review` copy by review mode and reason code instead of generic static text
- Modify: `web/lib/graph-timeline-api.ts`
  - type new review reason tags and details
- Modify: `web/lib/graph-timeline-ui.ts`
  - map review timeline tags to learner-facing Vietnamese labels
- Modify: `web/lib/node-progress-api.ts`
  - type and normalize `review_queue` and persisted `review_state` snapshots
- Create: `web/tests/graph-review-state.test.ts`
  - verify normalization of `review_queue` and review-state payloads
- Modify: `web/tests/graph-recommendation-ui.test.ts`
  - verify `review` messaging and CTA labels change with review metadata
- Modify: `web/tests/graph-timeline-ui.test.ts`
  - verify review tag labels

### Frontend graph surfaces

- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - render the review queue, keep it refreshed with node/quiz interactions, and show review-specific recommendation context
- Modify: `web/components/graph/LearningTimelineDrawer.tsx`
  - add visible support for review events and queue-related explanations
- Modify: `web/tests/learning-timeline-drawer.test.ts`
  - pin source-level review copy and review-aware filters

## Task 1: Add node-level review state models and scheduling service

**Files:**
- Modify: `deeptutor/services/graph/models.py`
- Create: `deeptutor/services/graph/review.py`
- Create: `tests/services/graph/test_review.py`

- [x] **Step 1: Write the failing review scheduling tests**

```python
from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.review import (
    build_default_review_state,
    rank_review_queue,
    record_review_signal,
)


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
                    "rationale": "",
                    "source_refs": [],
                },
                {
                    "edge_id": "edge_search_planning",
                    "source": "topic_search",
                    "target": "topic_planning",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                    "rationale": "",
                    "source_refs": [],
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


def test_record_review_signal_marks_quiz_failure_as_due_soon() -> None:
    state = build_default_review_state()

    updated = record_review_signal(
        review_state=state,
        signal_type="quiz_failed",
        node_id="topic_search",
        occurred_at="2026-05-06T09:00:00Z",
        score_ratio=0.4,
    )

    node_state = updated["nodes"]["topic_search"]
    assert round(node_state["forgetting_risk"], 2) == 0.8
    assert node_state["review_mode"] == "focused_review"
    assert node_state["due_at"] == "2026-05-07T09:00:00Z"


def test_rank_review_queue_prefers_blocking_prerequisite_over_older_leaf() -> None:
    review_state = {
        "nodes": {
            "topic_intro": {
                "last_reviewed_at": "2026-05-01T09:00:00Z",
                "due_at": "2026-05-07T09:00:00Z",
                "forgetting_risk": 0.72,
                "retrievability": 0.44,
                "review_mode": "full_node_review",
            },
            "topic_planning": {
                "last_reviewed_at": "2026-04-29T09:00:00Z",
                "due_at": "2026-05-06T12:00:00Z",
                "forgetting_risk": 0.68,
                "retrievability": 0.40,
                "review_mode": "light_recall_check",
            },
        }
    }

    queue = rank_review_queue(
        graph=build_graph(),
        review_state=review_state,
        active_path_node_ids=["topic_search"],
        now="2026-05-06T12:30:00Z",
    )

    assert queue[0]["node_id"] == "topic_intro"
    assert queue[0]["reason_codes"] == ["needs_review_before_advance", "high_unlock_value"]
    assert queue[1]["node_id"] == "topic_planning"
```

- [x] **Step 2: Run the new backend review tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_review.py -v`
Expected: FAIL with `ModuleNotFoundError` for `deeptutor.services.graph.review`.

- [x] **Step 3: Add review models in `models.py`**

```python
ReviewSignalType = Literal[
    "node_viewed",
    "quiz_passed",
    "quiz_failed",
    "remediation_completed",
    "remediation_failed",
]
ReviewMode = Literal["focused_review", "full_node_review", "light_recall_check"]
RecommendationReasonCode = Literal[
    "prerequisites_ready",
    "high_unlock_value",
    "close_to_current_path",
    "recent_quiz_weakness",
    "needs_review_before_advance",
    "review_due",
    "forgetting_risk_high",
]
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
    "review_recommended",
    "review_completed",
]
LearningTimelineReasonTag = Literal[
    "prerequisite_ready",
    "recent_weakness",
    "retry_passed",
    "remediation_active",
    "remediation_cleared",
    "advanced_to_next",
    "manual_retry",
    "mastery_high",
    "mastery_uncertain",
    "recent_failure",
    "retry_loop_detected",
    "hint_dependence",
    "prerequisite_risk_high",
    "remediation_recovered",
    "ready_to_advance",
    "review_due",
    "forgetting_risk_high",
]


class GraphNodeReviewState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    last_reviewed_at: str = ""
    due_at: str = ""
    forgetting_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    retrievability: float = Field(default=1.0, ge=0.0, le=1.0)
    review_mode: ReviewMode = "light_recall_check"


class GraphReviewQueueEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str
    review_mode: ReviewMode
    score: float = Field(ge=0.0, le=1.0)
    due_at: str = ""
    reason_codes: list[RecommendationReasonCode] = Field(default_factory=list)


class GraphReviewState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: dict[str, GraphNodeReviewState] = Field(default_factory=dict)
    queue: list[GraphReviewQueueEntry] = Field(default_factory=list)
```

- [x] **Step 4: Implement the minimal review scheduling service**

```python
from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta

from deeptutor.services.graph.models import CourseKnowledgeGraph


def build_default_review_state() -> dict[str, object]:
    return {"nodes": {}, "queue": []}


def record_review_signal(
    *,
    review_state: dict[str, object] | None,
    signal_type: str,
    node_id: str,
    occurred_at: str,
    score_ratio: float | None = None,
) -> dict[str, object]:
    snapshot = deepcopy(review_state or build_default_review_state())
    nodes = snapshot.setdefault("nodes", {})
    node_state = dict(nodes.get(node_id) or {})
    node_state.setdefault("last_reviewed_at", "")
    node_state.setdefault("due_at", "")
    node_state.setdefault("forgetting_risk", 0.0)
    node_state.setdefault("retrievability", 1.0)
    node_state.setdefault("review_mode", "light_recall_check")

    happened_at = datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))
    if signal_type == "quiz_failed":
        node_state["forgetting_risk"] = 0.8 if (score_ratio or 0.0) <= 0.5 else 0.65
        node_state["retrievability"] = 0.35 if (score_ratio or 0.0) <= 0.5 else 0.5
        node_state["review_mode"] = "focused_review"
        node_state["due_at"] = (happened_at + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    elif signal_type == "quiz_passed":
        node_state["forgetting_risk"] = 0.35
        node_state["retrievability"] = 0.78
        node_state["review_mode"] = "light_recall_check"
        node_state["last_reviewed_at"] = occurred_at
        node_state["due_at"] = (happened_at + timedelta(days=4)).isoformat().replace("+00:00", "Z")
    else:
        node_state["forgetting_risk"] = min(0.55, float(node_state["forgetting_risk"]) + 0.1)
        node_state["review_mode"] = "light_recall_check"
        node_state["due_at"] = (happened_at + timedelta(days=2)).isoformat().replace("+00:00", "Z")

    nodes[node_id] = node_state
    snapshot["nodes"] = nodes
    return snapshot


def rank_review_queue(
    *,
    graph: CourseKnowledgeGraph,
    review_state: dict[str, object] | None,
    active_path_node_ids: list[str],
    now: str,
) -> list[dict[str, object]]:
    nodes = dict((review_state or {}).get("nodes") or {})
    downstream = {
        node.node_id: {
            edge.target
            for edge in graph.edges
            if edge.relation_type == "prerequisite" and edge.source == node.node_id
        }
        for node in graph.nodes
    }

    def blocking_weight(node_id: str) -> float:
        return min(len(downstream.get(node_id, set())) / 2.0, 1.0)

    entries: list[dict[str, object]] = []
    for node_id, raw in nodes.items():
        risk = float(raw.get("forgetting_risk") or 0.0)
        if risk < 0.45:
            continue
        reasons = ["needs_review_before_advance"]
        if blocking_weight(node_id) > 0:
            reasons.append("high_unlock_value")
        score = min(0.65 * risk + 0.35 * blocking_weight(node_id), 0.99)
        entries.append(
            {
                "node_id": node_id,
                "review_mode": raw.get("review_mode", "light_recall_check"),
                "score": score,
                "due_at": str(raw.get("due_at") or ""),
                "reason_codes": reasons,
            }
        )

    entries.sort(key=lambda item: float(item["score"]), reverse=True)
    return entries[:3]
```

- [x] **Step 5: Run the backend review tests again**

Run: `.venv/bin/python -m pytest tests/services/graph/test_review.py -v`
Expected: PASS for both tests in `tests/services/graph/test_review.py`.

- [x] **Step 6: Commit Task 1**

```bash
git add deeptutor/services/graph/models.py deeptutor/services/graph/review.py tests/services/graph/test_review.py
git commit -m "feat: add graph review state service"
```

## Task 2: Merge review ranking into graph recommendation and timeline mapping

**Files:**
- Modify: `deeptutor/services/graph/recommendation.py`
- Modify: `deeptutor/services/graph/timeline.py`
- Modify: `tests/services/graph/test_recommendation.py`
- Modify: `tests/services/graph/test_timeline.py`

- [x] **Step 1: Extend recommendation and timeline tests first**

```python
from deeptutor.services.graph.recommendation import recommend_next_graph_node
from deeptutor.services.graph.timeline import (
    summarize_recommendation_change,
    timeline_reason_tags_from_recommendation,
)


def test_recommend_next_graph_node_prefers_due_review_over_advance_when_risk_is_high() -> None:
    recommendation = recommend_next_graph_node(
        graph=build_graph(),
        student_state={
            "current_node_id": "topic_search",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": ["topic_search"],
            "review_state": {
                "nodes": {
                    "topic_intro": {
                        "last_reviewed_at": "2026-05-01T09:00:00Z",
                        "due_at": "2026-05-06T09:00:00Z",
                        "forgetting_risk": 0.8,
                        "retrievability": 0.35,
                        "review_mode": "full_node_review",
                    }
                }
            },
        },
    )

    assert recommendation.recommended_node_id == "topic_intro"
    assert recommendation.mode == "review"
    assert "needs_review_before_advance" in recommendation.reason_codes
    assert "high_unlock_value" in recommendation.reason_codes


def test_timeline_reason_tags_from_recommendation_maps_review_reason_codes() -> None:
    tags = timeline_reason_tags_from_recommendation(
        ["needs_review_before_advance", "forgetting_risk_high"],
        mode="review",
    )

    assert tags == ["review_due", "forgetting_risk_high"]
    assert "xem lai" in summarize_recommendation_change(
        {"mode": "review", "reason_codes": ["needs_review_before_advance"]}
    ).lower()
```

- [x] **Step 2: Run targeted tests and confirm they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py tests/services/graph/test_timeline.py -v`
Expected: FAIL because `recommend_next_graph_node()` ignores `review_state` and `timeline_reason_tags_from_recommendation()` still maps review to remediation tags.

- [x] **Step 3: Update recommendation service to score review candidates before advance**

```python
from deeptutor.services.graph.review import rank_review_queue


def recommend_next_graph_node(
    *,
    graph: CourseKnowledgeGraph,
    student_state: dict[str, object],
) -> GraphRecommendation:
    mastered = set(student_state.get("mastered_nodes", []) or [])
    explored = set(student_state.get("explored_nodes", []) or [])
    current_node_id = str(student_state.get("current_node_id", "") or "")
    active_remediation = student_state.get("active_remediation") or {}
    remediation_target_id = str(active_remediation.get("target_node_id", "") or "")

    if remediation_target_id:
        backup_candidates = [
            node.node_id
            for node in graph.nodes
            if node.node_id not in {remediation_target_id, *mastered}
        ][:2]
        return GraphRecommendation(
            recommended_node_id=remediation_target_id,
            mode="remediate",
            score=0.99,
            reason_codes=["recent_quiz_weakness"],
            backup_node_ids=backup_candidates,
        )

    review_queue = rank_review_queue(
        graph=graph,
        review_state=student_state.get("review_state"),
        active_path_node_ids=[node_id for node_id in [current_node_id, *explored] if node_id],
        now="2026-05-06T12:00:00Z" if student_state.get("_test_now") else "",
    )
    if review_queue:
        top_review = review_queue[0]
        return GraphRecommendation(
            recommended_node_id=str(top_review["node_id"]),
            mode="review",
            score=float(top_review["score"]),
            reason_codes=list(top_review["reason_codes"]),
            backup_node_ids=[str(item["node_id"]) for item in review_queue[1:3]],
        )

    prerequisites, downstream = _build_prerequisite_maps(graph)
    weak_nodes = set(student_state.get("weak_node_ids", []) or [])
    frontier = {node_id for node_id in explored | mastered if node_id}
    if current_node_id:
        frontier.add(current_node_id)

    candidates: list[tuple[float, GraphRecommendation]] = []
    for node in graph.nodes:
        node_id = node.node_id
        if node_id in mastered:
            continue

        prereqs = prerequisites.get(node_id, set())
        explored_prereqs = prereqs & explored
        mastered_prereqs = prereqs & mastered
        prereq_count = len(prereqs)
        readiness = (
            1.0
            if prereq_count == 0
            else (len(mastered_prereqs) + 0.5 * len(explored_prereqs)) / prereq_count
        )
        distance = _graph_distance(frontier, node_id, prerequisites, downstream)
        continuity = 0.8 if not frontier else 0.0 if distance is None else max(0.2, 1.0 - 0.2 * distance)
        importance = min(_count_unlocks(node_id, downstream) / 3.0, 1.0)

        if node_id in weak_nodes:
            recommendation = GraphRecommendation(
                recommended_node_id=node_id,
                mode="remediate",
                score=min(0.75 + 0.10 * importance, 0.99),
                reason_codes=["recent_quiz_weakness"],
                backup_node_ids=[],
            )
            candidates.append((recommendation.score, recommendation))
            continue

        if prereqs and readiness < 1.0:
            continue
        if continuity == 0.0 and frontier:
            continue

        reasons = ["prerequisites_ready"]
        if importance > 0:
            reasons.append("high_unlock_value")
        if continuity >= 0.6:
            reasons.append("close_to_current_path")
        recommendation = GraphRecommendation(
            recommended_node_id=node_id,
            mode="advance",
            score=min(0.35 * readiness + 0.20 * importance + 0.20 * max(continuity, 0.4) + 0.25, 0.99),
            reason_codes=reasons,
            backup_node_ids=[],
        )
        candidates.append((recommendation.score, recommendation))

    candidates.sort(key=lambda item: item[0], reverse=True)
    primary = candidates[0][1]
    backups = [candidate.recommended_node_id for _, candidate in candidates[1:3]]
    return primary.model_copy(update={"backup_node_ids": backups})
```

```python
def _resolve_now(student_state: dict[str, object]) -> str:
    return str(student_state.get("_test_now") or current_learning_event_timestamp())
```

- [x] **Step 4: Update timeline summaries and reason-tag mapping for review**

```python
def summarize_recommendation_change(recommendation: dict[str, object]) -> str:
    mode = str(recommendation.get("mode") or "")
    if mode == "remediate":
        return "He thong doi buoc tiep theo de ban on lai phan con yeu."
    if mode == "review":
        return "He thong goi y ban xem lai mot node quan trong truoc khi hoc tiep."
    return "He thong da cap nhat buoc hoc tiep theo phu hop nhat."


def timeline_reason_tags_from_recommendation(
    reason_codes: list[str],
    *,
    mode: str,
) -> list[str]:
    tags: list[str] = []
    for code in reason_codes:
        if code == "prerequisites_ready":
            tags.append("prerequisite_ready")
        elif code == "recent_quiz_weakness":
            tags.append("recent_weakness")
        elif code == "needs_review_before_advance":
            tags.append("review_due" if mode == "review" else "remediation_active")
        elif code == "forgetting_risk_high":
            tags.append("forgetting_risk_high")
        elif code in {"high_unlock_value", "close_to_current_path"}:
            tags.append("advanced_to_next")
    if mode == "review" and "review_due" not in tags:
        tags.append("review_due")
    if mode == "remediate" and "remediation_active" not in tags:
        tags.append("remediation_active")
    return list(dict.fromkeys(tags))
```

- [x] **Step 5: Re-run the recommendation and timeline tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py tests/services/graph/test_timeline.py -v`
Expected: PASS, including the new review-specific assertions.

- [x] **Step 6: Commit Task 2**

```bash
git add deeptutor/services/graph/recommendation.py deeptutor/services/graph/timeline.py tests/services/graph/test_recommendation.py tests/services/graph/test_timeline.py
git commit -m "feat: rank graph review recommendations"
```

## Task 3: Update review state from graph activity and quiz outcomes, then expose `review_queue`

**Files:**
- Modify: `deeptutor/api/routers/node_progress.py`
- Modify: `deeptutor/api/routers/sessions.py`
- Modify: `tests/api/routers/test_node_progress.py`
- Modify: `tests/api/routers/test_sessions_graph_quiz.py`

- [x] **Step 1: Add failing API tests for `review_queue` and review-state updates**

```python
def test_get_node_progress_includes_review_queue(store: SQLiteSessionStore) -> None:
    await store.save_student_state(
        "session-1",
        "intro-ai",
        {
            "current_node_id": "topic_search",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": ["topic_search"],
            "dynamic_nodes": [],
            "active_remediation": None,
            "review_state": {
                "nodes": {
                    "topic_intro": {
                        "last_reviewed_at": "2026-05-01T09:00:00Z",
                        "due_at": "2026-05-06T09:00:00Z",
                        "forgetting_risk": 0.8,
                        "retrievability": 0.35,
                        "review_mode": "full_node_review",
                    }
                },
                "queue": [
                    {
                        "node_id": "topic_intro",
                        "review_mode": "full_node_review",
                        "score": 0.87,
                        "due_at": "2026-05-06T09:00:00Z",
                        "reason_codes": ["needs_review_before_advance", "high_unlock_value"],
                    }
                ],
            },
        },
    )

    response = client.get("/api/v1/graph/node-progress/intro-ai", params={"session_id": "session-1"})

    assert response.status_code == 200
    body = response.json()
    assert body["review_queue"][0]["node_id"] == "topic_intro"
    assert body["review_state"]["nodes"]["topic_intro"]["review_mode"] == "full_node_review"


def test_submit_graph_quiz_failure_updates_review_state(store: SQLiteSessionStore) -> None:
    client.post(
        "/api/v1/graph/current-node",
        json={
            "session_id": "session-1",
            "course_id": "intro-ai",
            "node_id": "topic_search",
        },
    )
    response = client.post(
        "/api/v1/sessions/graph-quiz/submit",
        json={
            "session_id": "session-1",
            "course_id": "intro-ai",
            "node_id": "topic_search",
            "quiz_kind": "node_quiz",
            "question_count": 5,
            "correct_count": 2,
            "answers": [],
            "weak_concepts": ["state_space"],
        },
    )

    assert response.status_code == 200
    state = store.run(store.get_student_state("session-1", "intro-ai"))
    assert state["review_state"]["nodes"]["topic_search"]["review_mode"] == "focused_review"
    assert state["review_state"]["queue"][0]["node_id"] == "topic_search"
```

- [x] **Step 2: Run the API tests and confirm the new assertions fail**

Run: `.venv/bin/python -m pytest tests/api/routers/test_node_progress.py tests/api/routers/test_sessions_graph_quiz.py -v`
Expected: FAIL because `NodeProgressResponse` has no `review_queue`/`review_state` fields and the session quiz flow never writes review-state data.

- [x] **Step 3: Extend `node_progress.py` to update and return review state**

```python
class NodeProgressResponse(BaseModel):
    progress: dict[str, str]
    current_node_id: str = ""
    dynamic_nodes: list[dict[str, object]] = []
    active_remediation: dict[str, object] | None = None
    review_state: dict[str, object] | None = None
    review_queue: list[dict[str, object]] = []
    in_session_knowledge_state: dict[str, object] | None = None
    next_step_decision: dict[str, object] | None = None


async def mark_node_progress(req: MarkProgressRequest):
    if req.status not in ("explored", "mastered"):
        raise HTTPException(status_code=400, detail="status must be 'explored' or 'mastered'")
    store = get_sqlite_session_store()
    ok = await store.mark_node_progress(
        req.session_id,
        req.course_id,
        req.node_id,
        req.status,
        current_node_id=req.current_node_id,
    )
    if ok:
        template = await store.get_course_template(req.course_id)
        if not template:
            raise HTTPException(status_code=404, detail="Course template not found")
        created_at = current_learning_event_timestamp()
        state = await store.get_student_state(req.session_id, req.course_id) or {}
        review_state = record_review_signal(
            review_state=state.get("review_state"),
            signal_type="node_viewed" if req.status == "explored" else "quiz_passed",
            node_id=req.node_id,
            occurred_at=created_at,
        )
        review_state["queue"] = rank_review_queue(
            graph=CourseKnowledgeGraph.model_validate(json.loads(template["template_json"])),
            review_state=review_state,
            active_path_node_ids=[str(state.get("current_node_id") or req.node_id)],
            now=created_at,
        )
        state["review_state"] = review_state
        await store.save_student_state(req.session_id, req.course_id, state)
```

```python
return NodeProgressResponse(
    progress=progress,
    current_node_id=str((state or {}).get("current_node_id", "") or ""),
    dynamic_nodes=list((state or {}).get("dynamic_nodes", []) or []),
    active_remediation=(state or {}).get("active_remediation"),
    review_state=(state or {}).get("review_state"),
    review_queue=list(((state or {}).get("review_state") or {}).get("queue") or []),
    in_session_knowledge_state=(state or {}).get("in_session_knowledge_state"),
    next_step_decision=((state or {}).get("in_session_knowledge_state") or {}).get("next_step_decision"),
)
```

- [x] **Step 4: Update graph quiz/remediation submission flow in `sessions.py`**

```python
review_signal_type = "quiz_passed" if passed else "quiz_failed"
review_state = record_review_signal(
    review_state=state.get("review_state"),
    signal_type=review_signal_type,
    node_id=node_id,
    occurred_at=created_at,
    score_ratio=score_ratio,
)
review_state["queue"] = rank_review_queue(
    graph=graph,
    review_state=review_state,
    active_path_node_ids=[str(state.get("current_node_id") or node_id)],
    now=created_at,
)
state["review_state"] = review_state
await store.save_student_state(session_id, course_id, state)
```

```python
if active_remediation and passed:
    review_state = record_review_signal(
        review_state=state.get("review_state"),
        signal_type="remediation_completed",
        node_id=str(active_remediation.get("target_node_id") or node_id),
        occurred_at=created_at,
        score_ratio=score_ratio,
    )
```

- [x] **Step 5: Re-run the API tests**

Run: `.venv/bin/python -m pytest tests/api/routers/test_node_progress.py tests/api/routers/test_sessions_graph_quiz.py -v`
Expected: PASS, with responses now carrying `review_state` and `review_queue`.

- [x] **Step 6: Commit Task 3**

```bash
git add deeptutor/api/routers/node_progress.py deeptutor/api/routers/sessions.py tests/api/routers/test_node_progress.py tests/api/routers/test_sessions_graph_quiz.py
git commit -m "feat: persist graph review queue in session state"
```

## Task 4: Add frontend review contracts, recommendation copy, and graph queue UI

**Files:**
- Modify: `web/lib/graph-recommendation-api.ts`
- Modify: `web/lib/graph-recommendation-ui.ts`
- Modify: `web/lib/graph-timeline-api.ts`
- Modify: `web/lib/graph-timeline-ui.ts`
- Modify: `web/lib/node-progress-api.ts`
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/LearningTimelineDrawer.tsx`
- Create: `web/tests/graph-review-state.test.ts`
- Modify: `web/tests/graph-recommendation-ui.test.ts`
- Modify: `web/tests/graph-timeline-ui.test.ts`
- Modify: `web/tests/learning-timeline-drawer.test.ts`

- [x] **Step 1: Write failing frontend tests for review metadata and UI copy**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  describeGraphRecommendation,
  getGraphRecommendationTimelineCtaLabel,
} from "../lib/graph-recommendation-ui.ts";
import { normalizeNodeProgressSnapshot } from "../lib/node-progress-api.ts";
import { getTimelineReasonTagLabel } from "../lib/graph-timeline-ui.ts";

test("describeGraphRecommendation formats review copy for full node review", () => {
  const summary = describeGraphRecommendation({
    recommended_node_id: "topic_intro",
    mode: "review",
    score: 0.83,
    reason_codes: ["needs_review_before_advance", "high_unlock_value"],
    backup_node_ids: [],
    review_mode: "full_node_review",
  });

  assert.equal(summary.badge, "Ôn tập");
  assert.match(summary.message, /nền tảng|quan trọng/i);
});

test("normalizeNodeProgressSnapshot keeps review queue entries", () => {
  const snapshot = normalizeNodeProgressSnapshot({
    progress: {},
    current_node_id: "topic_search",
    dynamic_nodes: [],
    active_remediation: null,
    review_state: {
        nodes: {
          topic_intro: {
            due_at: "2026-05-06T09:00:00Z",
            forgetting_risk: 0.8,
            retrievability: 0.35,
            review_mode: "full_node_review",
          },
        },
    },
    review_queue: [
      {
        node_id: "topic_intro",
        review_mode: "full_node_review",
        score: 0.87,
        due_at: "2026-05-06T09:00:00Z",
        reason_codes: ["needs_review_before_advance"],
      },
    ],
  });

  assert.equal(snapshot.review_queue?.[0]?.node_id, "topic_intro");
  assert.equal(snapshot.review_state?.nodes?.topic_intro?.review_mode, "full_node_review");
});

test("graph timeline labels map new review tags", () => {
  assert.equal(getTimelineReasonTagLabel("review_due"), "Đến lúc ôn tập");
  assert.equal(getTimelineReasonTagLabel("forgetting_risk_high"), "Nguy cơ quên cao");
  assert.equal(getGraphRecommendationTimelineCtaLabel({ mode: "review" }), "Vì sao nên ôn tập?");
});
```

- [x] **Step 2: Run the Node tests and confirm they fail**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts web/tests/graph-timeline-ui.test.ts web/tests/graph-review-state.test.ts`
Expected: FAIL because the current TS types do not expose `review_queue`, `review_state`, or review-aware copy.

- [x] **Step 3: Extend the frontend API contracts and formatters**

```ts
// web/lib/graph-recommendation-api.ts
export interface GraphRecommendation {
  recommended_node_id: string;
  mode: "advance" | "review" | "remediate";
  score: number;
  reason_codes: string[];
  backup_node_ids: string[];
  review_mode?: "focused_review" | "full_node_review" | "light_recall_check";
}
```

```ts
// web/lib/node-progress-api.ts
export interface ReviewQueueEntrySnapshot {
  node_id: string;
  review_mode: "focused_review" | "full_node_review" | "light_recall_check";
  score: number;
  due_at: string;
  reason_codes: string[];
}

export interface ReviewStateSnapshot {
  nodes: Record<string, {
    due_at: string;
    forgetting_risk: number;
    retrievability: number;
    review_mode: ReviewQueueEntrySnapshot["review_mode"];
  }>;
}

export interface NodeProgressSnapshot {
  progress: Record<string, NodeStatus>;
  current_node_id: string;
  dynamic_nodes: DynamicKnowledgeGraphNode[];
  active_remediation: ActiveGraphRemediationSnapshot | null;
  review_state?: ReviewStateSnapshot | null;
  review_queue?: ReviewQueueEntrySnapshot[];
  in_session_knowledge_state?: Record<string, unknown> | null;
  next_step_decision?: NextStepDecisionSnapshot | null;
}
```

```ts
// web/lib/graph-recommendation-ui.ts
if (recommendation.mode === "review") {
  const reviewMode = recommendation.review_mode ?? "light_recall_check";
  if (reviewMode === "full_node_review") {
    return {
      badge: "Ôn tập",
      message: "Một phần nền tảng quan trọng đang đến lúc cần ôn lại để giữ đà học và mở khóa bước tiếp theo.",
    };
  }
  if (reviewMode === "focused_review") {
    return {
      badge: "Ôn điểm yếu",
      message: "Hệ thống phát hiện một nhóm ý chính đang yếu dần. Ôn nhanh phần này sẽ giúp bạn học tiếp chắc hơn.",
    };
  }
  return {
    badge: "Nhắc lại ngắn",
    message: "Bạn đã học phần này rồi, nhưng một lượt nhắc lại ngắn lúc này sẽ giúp ghi nhớ bền hơn.",
  };
}
```

```ts
// web/lib/graph-timeline-ui.ts
const REASON_TAG_LABELS: Record<GraphTimelineReasonTag, string> = {
  prerequisite_ready: "Đủ điều kiện tiên quyết",
  recent_weakness: "Còn yếu gần đây",
  retry_passed: "Đã vượt qua sau khi làm lại",
  remediation_active: "Đang cần ôn lại",
  remediation_cleared: "Đã hoàn thành ôn lại",
  advanced_to_next: "Đã tiến sang bước mới",
  manual_retry: "Chủ động làm lại",
  mastery_high: "Mức nắm vững cao",
  mastery_uncertain: "Mức nắm vững chưa chắc chắn",
  recent_failure: "Vừa gặp lỗi gần đây",
  retry_loop_detected: "Đang lặp lại cùng một lỗi",
  hint_dependence: "Đang phụ thuộc nhiều vào gợi ý",
  prerequisite_risk_high: "Rủi ro thiếu nền tảng cao",
  remediation_recovered: "Đã hồi phục sau ôn tập",
  ready_to_advance: "Sẵn sàng tiến lên",
  review_due: "Đến lúc ôn tập",
  forgetting_risk_high: "Nguy cơ quên cao",
};
```

- [x] **Step 4: Render the review queue in `KnowledgeGraphViewer.tsx` and keep it refreshed**

```tsx
const [reviewQueue, setReviewQueue] = useState<ReviewQueueEntrySnapshot[]>([]);

Promise.all([templatePromise, progressPromise, recommendationPromise])
  .then(([templateData, progressSnapshot, recommendationData]) => {
    applyCourseTemplate(templateData);
    setProgressMap(progressSnapshot.progress);
    setCurrentNodeId(progressSnapshot.current_node_id);
    setDynamicNodes(progressSnapshot.dynamic_nodes);
    setActiveRemediation(progressSnapshot.active_remediation);
    setRecommendation(recommendationData);
    setReviewQueue(progressSnapshot.review_queue ?? []);
  });

const refreshProgress = useCallback(async (targetCourseId?: string | null) => {
  if (!sessionId || !(targetCourseId ?? courseId)) return null;
  const snapshot = await getNodeProgress(sessionId, targetCourseId ?? courseId ?? "");
  setProgressMap(snapshot.progress);
  setCurrentNodeId(snapshot.current_node_id);
  setDynamicNodes(snapshot.dynamic_nodes);
  setActiveRemediation(snapshot.active_remediation);
  setReviewQueue(snapshot.review_queue ?? []);
  return snapshot;
}, [courseId, sessionId]);
```

```tsx
{reviewQueue.length ? (
  <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
          Review Queue
        </div>
        <p className="mt-1 text-sm text-amber-950">
          Một vài node nên ôn lại lúc này để tránh quên hoặc bị kẹt ở bước tiếp theo.
        </p>
      </div>
      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-800">
        {reviewQueue.length}
      </span>
    </div>

    <div className="mt-3 space-y-2">
      {reviewQueue.map((entry) => (
        <button
          key={entry.node_id}
          onClick={() => openTimeline(entry.node_id)}
          className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-white px-3 py-2 text-left"
        >
          <div>
            <div className="text-sm font-medium text-slate-900">{entry.node_id}</div>
            <div className="mt-1 text-xs text-slate-600">{entry.review_mode}</div>
          </div>
          <div className="text-xs font-semibold text-amber-800">
            {Math.round(entry.score * 100)}%
          </div>
        </button>
      ))}
    </div>
  </section>
) : null}
```

- [x] **Step 5: Re-run the focused frontend tests**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts web/tests/graph-timeline-ui.test.ts web/tests/graph-review-state.test.ts web/tests/learning-timeline-drawer.test.ts`
Expected: PASS, with review copy, tag labels, and queue parsing all covered.

- [x] **Step 6: Commit Task 4**

```bash
git add web/lib/graph-recommendation-api.ts web/lib/graph-recommendation-ui.ts web/lib/graph-timeline-api.ts web/lib/graph-timeline-ui.ts web/lib/node-progress-api.ts web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/LearningTimelineDrawer.tsx web/tests/graph-review-state.test.ts web/tests/graph-recommendation-ui.test.ts web/tests/graph-timeline-ui.test.ts web/tests/learning-timeline-drawer.test.ts
git commit -m "feat: surface graph review queue in web ui"
```

## Task 5: Run end-to-end verification for the Phase 1 rollout

**Files:**
- Modify: `docs/superpowers/plans/2026-05-06-spaced-repetition-knowledge-graph.md`

- [x] **Step 1: Run backend graph-domain tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_review.py tests/services/graph/test_recommendation.py tests/services/graph/test_timeline.py -v`
Expected: PASS.

- [x] **Step 2: Run backend router tests**

Run: `.venv/bin/python -m pytest tests/api/routers/test_node_progress.py tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_timeline.py -v`
Expected: PASS.

- [x] **Step 3: Run frontend graph tests**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts web/tests/graph-timeline-ui.test.ts web/tests/graph-review-state.test.ts web/tests/learning-timeline-drawer.test.ts`
Expected: PASS.

- [x] **Step 4: Run one full cross-surface smoke suite**

Run: `.venv/bin/python -m pytest tests/services/graph/test_review.py tests/services/graph/test_recommendation.py tests/services/graph/test_timeline.py tests/api/routers/test_node_progress.py tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_timeline.py -q`
Expected: PASS with no graph review regressions.

- [x] **Step 5: Commit final verification and plan checkbox updates**

```bash
git add docs/superpowers/plans/2026-05-06-spaced-repetition-knowledge-graph.md
git commit -m "docs: mark spaced repetition rollout verification"
```

## Self-Review Notes

- Spec coverage:
  - review scheduling state: Task 1 and Task 3
  - risk-first recommendation mode: Task 1 and Task 2
  - timeline explainability: Task 2 and Task 4
  - graph and queue UI surfaces: Task 4
  - rollout verification: Task 5
- Placeholder scan:
  - no `TODO`, `TBD`, or “similar to Task N” placeholders remain
  - all steps include concrete files, commands, and code snippets
- Type consistency:
  - `review_state`, `review_queue`, `review_mode`, `review_due`, and `forgetting_risk_high` are named consistently across backend and frontend tasks
