# Mastery Remediation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a student-facing remediation loop for graph-linked quizzes, including multiple-choice-only graph quizzes, difficulty and failure-aware question counts, persistent remediation state, chat-based remediation lessons, remediation mini-quizzes, and recommendation/graph integration.

**Architecture:** Keep remediation state and pass/fail transitions deterministic in the backend graph/session domain. Reuse the existing graph-linked quiz flow by adding a graph quiz policy layer, a remediation state manager, cached remediation artifacts, and a remediation-aware recommendation override. Surface the flow through quiz result CTAs, chat-driven remediation lessons, and explicit remediation styling in the graph UI.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session store, pytest, TypeScript, React/Next.js, Node test runner, existing DeepTutor capability/runtime infrastructure

---

## File Structure

### Backend quiz and remediation domain

- Create: `deeptutor/services/graph/quiz_policy.py`
  - graph-linked quiz type enforcement, question-count policy, pass-threshold helpers, failure severity helpers
- Create: `deeptutor/services/graph/remediation.py`
  - remediation state creation, progression, target resolution, cache-key helpers
- Modify: `deeptutor/services/graph/models.py`
  - remediation state models and typed literals for severity/status
- Modify: `deeptutor/services/graph/recommendation.py`
  - remediation-first recommendation override with backup nodes
- Create: `tests/services/graph/test_quiz_policy.py`
  - unit tests for graph quiz policy
- Modify: `tests/services/graph/test_recommendation.py`
  - remediation recommendation behavior
- Create: `tests/services/graph/test_remediation.py`
  - remediation state, target resolution, and clear-rule coverage

### Backend persistence and graph/quiz integration

- Modify: `deeptutor/services/session/sqlite_store.py`
  - persist remediation state and remediation cache inside student graph state
- Modify: `deeptutor/api/routers/sessions.py`
  - graph quiz result evaluation, remediation state updates, graph quiz outcome transitions
- Modify: `deeptutor/api/routers/node_progress.py`
  - return remediation metadata in graph progress snapshots if needed by frontend
- Modify: `tests/services/session/test_sqlite_store.py`
  - remediation persistence and cache tests
- Modify: `tests/api/test_notebook_router.py`
  - graph-linked quiz result progression and remediation creation tests
- Modify: `tests/api/routers/test_node_progress.py`
  - remediation metadata exposure through node progress API

### Backend remediation artifact flow

- Modify: `deeptutor/capabilities/deep_question.py`
  - support remediation lesson and remediation mini-quiz generation modes
- Modify: `deeptutor/capabilities/request_contracts.py`
  - allow remediation graph metadata through validated request config
- Modify: `deeptutor/services/session/turn_runtime.py`
  - preserve remediation runtime metadata for capability execution
- Modify: `web/lib/knowledge-graph-actions.ts`
  - add remediation lesson request helper payloads
- Modify: `web/lib/quiz-types.ts`
  - carry graph quiz kind and weak-concept metadata through quiz artifacts
- Create: `tests/capabilities/test_deep_question_remediation.py`
  - remediation lesson/mini-quiz artifact expectations
- Modify: `web/tests/quiz-types.test.ts`
  - remediation artifact metadata parsing

### Frontend quiz, graph, and recommendation integration

- Modify: `web/components/quiz/QuizViewer.tsx`
  - failed graph quiz CTA block, remediation start, retry/back-to-graph actions, remediation mini-quiz completion flow
- Modify: `web/lib/session-api.ts`
  - typed graph quiz result/remediation endpoints and metadata types
- Modify: `web/lib/graph-recommendation-ui.ts`
  - remediation-specific recommendation copy
- Modify: `web/lib/course-knowledge-graph.ts`
  - remediation node styling hints
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - remediation state rendering and recommendation refresh after remediation transitions
- Modify: `web/components/graph/NodeDetailPanel.tsx`
  - remediation badges and remediation-specific next-step explanation
- Create: `web/lib/remediation-ui.ts`
  - UI formatters for failure severity, remediation state, CTA copy
- Create: `web/tests/remediation-ui.test.ts`
  - remediation copy and badge formatter expectations
- Modify: `web/tests/course-knowledge-graph.test.ts`
  - remediation node styling coverage
- Modify: `web/tests/graph-recommendation-ui.test.ts`
  - remediation recommendation card copy

## Task 1: Add graph quiz policy and remediation models

**Files:**
- Create: `deeptutor/services/graph/quiz_policy.py`
- Modify: `deeptutor/services/graph/models.py`
- Create: `tests/services/graph/test_quiz_policy.py`

- [ ] **Step 1: Write the failing graph quiz policy tests**

```python
from deeptutor.services.graph.models import (
    ActiveGraphRemediation,
    GraphQuizFailureSeverity,
)
from deeptutor.services.graph.quiz_policy import (
    determine_graph_quiz_count,
    determine_remediation_quiz_count,
    determine_graph_quiz_pass_threshold,
    determine_failure_severity,
    normalize_graph_quiz_kinds,
)


def test_graph_quiz_count_uses_difficulty_and_failure_severity() -> None:
    assert determine_graph_quiz_count("easy", None) == 3
    assert determine_graph_quiz_count("medium", "moderate") == 6
    assert determine_graph_quiz_count("hard", "severe") == 9


def test_remediation_quiz_count_is_shorter_and_grows_by_attempt() -> None:
    assert determine_remediation_quiz_count("easy", attempt_count=0) == 2
    assert determine_remediation_quiz_count("medium", attempt_count=1) == 4
    assert determine_remediation_quiz_count("hard", attempt_count=2) == 5


def test_graph_quiz_pass_threshold_is_count_based() -> None:
    assert determine_graph_quiz_pass_threshold(3) == 2
    assert determine_graph_quiz_pass_threshold(5) == 4
    assert determine_graph_quiz_pass_threshold(7) == 5


def test_failure_severity_uses_score_and_prerequisite_weakness() -> None:
    assert determine_failure_severity(
        score_ratio=0.62,
        weak_concepts=["search_state_space"],
        prerequisite_weakness=False,
    ) == "moderate"
    assert determine_failure_severity(
        score_ratio=0.2,
        weak_concepts=["search_state_space"],
        prerequisite_weakness=True,
    ) == "severe"


def test_normalize_graph_quiz_kinds_forces_multiple_choice() -> None:
    normalized = normalize_graph_quiz_kinds(["coding", "multiple_choice", "written"])
    assert normalized == ["multiple_choice"]


def test_active_graph_remediation_defaults_cache_fields() -> None:
    state = ActiveGraphRemediation.model_validate(
        {
            "source_node_id": "topic_search",
            "target_node_id": "topic_intro",
            "weak_concepts": ["state_space"],
            "failure_severity": "moderate",
            "status": "recommended",
        }
    )

    assert state.attempt_count == 0
    assert state.last_node_quiz_score is None
    assert state.last_remediation_quiz_score is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_quiz_policy.py -v`
Expected: FAIL with `ImportError` or `AttributeError` because the quiz policy functions and remediation models do not exist yet.

- [ ] **Step 3: Add remediation models and quiz policy helpers**

```python
# deeptutor/services/graph/models.py
GraphQuizFailureSeverity = Literal["mild", "moderate", "severe"]
GraphRemediationStatus = Literal[
    "recommended",
    "lesson_ready",
    "mini_quiz_ready",
    "passed_mini_quiz",
    "completed",
]


class ActiveGraphRemediation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_node_id: str
    target_node_id: str
    weak_concepts: list[str] = Field(default_factory=list)
    failure_severity: GraphQuizFailureSeverity
    status: GraphRemediationStatus
    attempt_count: int = 0
    last_node_quiz_score: float | None = None
    last_remediation_quiz_score: float | None = None


class GraphRemediationCacheEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cache_key: str
    target_node_id: str
    weak_concepts: list[str] = Field(default_factory=list)
    lesson_artifact: dict[str, object] = Field(default_factory=dict)
    mini_quiz_artifact: dict[str, object] = Field(default_factory=dict)
    created_at: str = ""
```

```python
# deeptutor/services/graph/quiz_policy.py
from __future__ import annotations


def determine_graph_quiz_count(
    difficulty: str,
    failure_severity: str | None,
) -> int:
    base = {"easy": 3, "medium": 5, "hard": 7}.get(difficulty, 5)
    adjustment = {"mild": 0, "moderate": 1, "severe": 2}.get(failure_severity or "", 0)
    return min(base + adjustment, 9)


def determine_remediation_quiz_count(difficulty: str, attempt_count: int) -> int:
    base = {"easy": 2, "medium": 3, "hard": 4}.get(difficulty, 3)
    return min(base + (1 if attempt_count > 0 else 0), 5)


def determine_graph_quiz_pass_threshold(question_count: int) -> int:
    if question_count <= 3:
        return 2
    if question_count <= 5:
        return 4
    return 5


def determine_failure_severity(
    *,
    score_ratio: float,
    weak_concepts: list[str],
    prerequisite_weakness: bool,
) -> str:
    if prerequisite_weakness or score_ratio < 0.35:
        return "severe"
    if score_ratio < 0.7 or len(weak_concepts) >= 2:
        return "moderate"
    return "mild"


def normalize_graph_quiz_kinds(question_kinds: list[str]) -> list[str]:
    return ["multiple_choice"]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/graph/test_quiz_policy.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/models.py deeptutor/services/graph/quiz_policy.py tests/services/graph/test_quiz_policy.py
git commit -m "feat: add graph remediation quiz policy"
```

## Task 2: Add remediation state manager and target resolution

**Files:**
- Create: `deeptutor/services/graph/remediation.py`
- Create: `tests/services/graph/test_remediation.py`

- [ ] **Step 1: Write the failing remediation state tests**

```python
from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.remediation import (
    clear_completed_remediation,
    create_or_update_remediation_state,
    mark_remediation_mini_quiz_passed,
    resolve_remediation_target,
)


def build_remediation_graph() -> CourseKnowledgeGraph:
    return CourseKnowledgeGraph.model_validate(
        {
            "course_id": "intro-ai",
            "title": "Intro AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "topic_intro", "title": "Intro", "node_type": "topic"},
                {"node_id": "topic_search", "title": "Search", "node_type": "topic"},
                {"node_id": "topic_planning", "title": "Planning", "node_type": "topic"},
            ],
            "edges": [
                {"edge_id": "edge_intro_search", "source": "topic_intro", "target": "topic_search", "relation_type": "prerequisite", "confidence": 1.0},
                {"edge_id": "edge_search_planning", "source": "topic_search", "target": "topic_planning", "relation_type": "prerequisite", "confidence": 1.0},
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


def test_resolve_remediation_target_prefers_current_node_without_prerequisite_gap() -> None:
    target = resolve_remediation_target(
        graph=build_remediation_graph(),
        source_node_id="topic_search",
        weak_concepts=["state_space"],
        mastered_nodes=["topic_intro"],
        prerequisite_weakness=False,
    )

    assert target["target_node_id"] == "topic_search"


def test_resolve_remediation_target_drops_to_prerequisite_when_needed() -> None:
    target = resolve_remediation_target(
        graph=build_remediation_graph(),
        source_node_id="topic_planning",
        weak_concepts=["state_space"],
        mastered_nodes=[],
        prerequisite_weakness=True,
    )

    assert target["target_node_id"] == "topic_search"


def test_create_or_update_remediation_state_sets_recommended_status() -> None:
    state = create_or_update_remediation_state(
        current_state={},
        source_node_id="topic_search",
        target_node_id="topic_intro",
        weak_concepts=["state_space"],
        failure_severity="moderate",
        score_ratio=0.4,
    )

    assert state["active_remediation"]["status"] == "recommended"
    assert state["active_remediation"]["attempt_count"] == 0


def test_remediation_state_clears_only_after_mini_quiz_and_main_quiz_pass() -> None:
    state = create_or_update_remediation_state(
        current_state={},
        source_node_id="topic_search",
        target_node_id="topic_intro",
        weak_concepts=["state_space"],
        failure_severity="moderate",
        score_ratio=0.4,
    )
    state = mark_remediation_mini_quiz_passed(state, score_ratio=1.0)
    assert state["active_remediation"]["status"] == "passed_mini_quiz"

    uncleared = clear_completed_remediation(
        state,
        passed_node_id="topic_intro",
    )
    assert uncleared["active_remediation"]["status"] == "passed_mini_quiz"

    cleared = clear_completed_remediation(
        state,
        passed_node_id="topic_search",
    )
    assert cleared["active_remediation"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_remediation.py -v`
Expected: FAIL with `ImportError` because the remediation service does not exist yet.

- [ ] **Step 3: Implement remediation target resolution and state transitions**

```python
# deeptutor/services/graph/remediation.py
from __future__ import annotations

from collections import defaultdict


def _build_prerequisites(graph):
    prerequisites = defaultdict(list)
    for edge in graph.edges:
        if edge.relation_type == "prerequisite":
            prerequisites[edge.target].append(edge.source)
    return prerequisites


def resolve_remediation_target(
    *,
    graph,
    source_node_id: str,
    weak_concepts: list[str],
    mastered_nodes: list[str],
    prerequisite_weakness: bool,
) -> dict[str, object]:
    if not prerequisite_weakness:
        return {
            "target_node_id": source_node_id,
            "weak_concepts": weak_concepts,
        }

    prerequisites = _build_prerequisites(graph)
    for prerequisite_id in prerequisites.get(source_node_id, []):
        if prerequisite_id not in set(mastered_nodes):
            return {
                "target_node_id": prerequisite_id,
                "weak_concepts": weak_concepts,
            }

    return {
        "target_node_id": source_node_id,
        "weak_concepts": weak_concepts,
    }


def create_or_update_remediation_state(
    current_state: dict[str, object],
    *,
    source_node_id: str,
    target_node_id: str,
    weak_concepts: list[str],
    failure_severity: str,
    score_ratio: float,
) -> dict[str, object]:
    next_state = dict(current_state)
    next_state["active_remediation"] = {
        "source_node_id": source_node_id,
        "target_node_id": target_node_id,
        "weak_concepts": weak_concepts,
        "failure_severity": failure_severity,
        "status": "recommended",
        "attempt_count": 0,
        "last_node_quiz_score": score_ratio,
        "last_remediation_quiz_score": None,
    }
    return next_state


def mark_remediation_mini_quiz_passed(
    current_state: dict[str, object],
    *,
    score_ratio: float,
) -> dict[str, object]:
    next_state = dict(current_state)
    active = dict(next_state.get("active_remediation") or {})
    active["status"] = "passed_mini_quiz"
    active["last_remediation_quiz_score"] = score_ratio
    next_state["active_remediation"] = active
    return next_state


def clear_completed_remediation(
    current_state: dict[str, object],
    *,
    passed_node_id: str,
) -> dict[str, object]:
    next_state = dict(current_state)
    active = next_state.get("active_remediation") or {}
    if active.get("status") == "passed_mini_quiz" and active.get("source_node_id") == passed_node_id:
        next_state["active_remediation"] = None
    return next_state
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/graph/test_remediation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/remediation.py tests/services/graph/test_remediation.py
git commit -m "feat: add remediation state manager"
```

## Task 3: Make recommendation remediation-aware

**Files:**
- Modify: `deeptutor/services/graph/recommendation.py`
- Modify: `tests/services/graph/test_recommendation.py`

- [ ] **Step 1: Write the failing remediation recommendation test**

```python
from deeptutor.services.graph.recommendation import recommend_next_graph_node
from tests.services.graph.test_recommendation import build_graph


def test_recommend_next_graph_node_prioritizes_active_remediation_target() -> None:
    recommendation = recommend_next_graph_node(
        graph=build_graph(),
        student_state={
            "current_node_id": "topic_planning",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": ["topic_search"],
            "active_remediation": {
                "source_node_id": "topic_planning",
                "target_node_id": "topic_search",
                "weak_concepts": ["state_space"],
                "failure_severity": "moderate",
                "status": "recommended",
                "attempt_count": 0,
                "last_node_quiz_score": 0.4,
                "last_remediation_quiz_score": None,
            },
        },
    )

    assert recommendation.recommended_node_id == "topic_search"
    assert recommendation.mode == "remediate"
    assert "recent_quiz_weakness" in recommendation.reason_codes
    assert recommendation.backup_node_ids
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py::test_recommend_next_graph_node_prioritizes_active_remediation_target -v`
Expected: FAIL because remediation state is currently ignored.

- [ ] **Step 3: Add remediation override before normal recommendation ranking**

```python
# deeptutor/services/graph/recommendation.py
active_remediation = student_state.get("active_remediation") or {}
target_node_id = str(active_remediation.get("target_node_id", "") or "")
if target_node_id:
    backup_candidates = [
        node.node_id
        for node in graph.nodes
        if node.node_id not in {target_node_id, *mastered}
    ][:2]
    return GraphRecommendation(
        recommended_node_id=target_node_id,
        mode="remediate",
        score=0.99,
        reason_codes=["recent_quiz_weakness"],
        backup_node_ids=backup_candidates,
    )
```

- [ ] **Step 4: Run the recommendation remediation test**

Run: `.venv/bin/python -m pytest tests/services/graph/test_recommendation.py::test_recommend_next_graph_node_prioritizes_active_remediation_target -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/recommendation.py tests/services/graph/test_recommendation.py
git commit -m "feat: prioritize active remediation in graph recommendations"
```

## Task 4: Persist remediation state and cache in session graph progress

**Files:**
- Modify: `deeptutor/services/session/sqlite_store.py`
- Modify: `tests/services/session/test_sqlite_store.py`

- [ ] **Step 1: Write the failing persistence tests**

```python
async def test_upsert_and_read_student_state_preserves_active_remediation(store: SQLiteSessionStore) -> None:
    await store.save_student_state(
        "session-1",
        "intro-ai",
        {
            "current_node_id": "topic_search",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": ["topic_search"],
            "weak_node_ids": ["topic_search"],
            "active_remediation": {
                "source_node_id": "topic_search",
                "target_node_id": "topic_intro",
                "weak_concepts": ["state_space"],
                "failure_severity": "moderate",
                "status": "recommended",
                "attempt_count": 0,
                "last_node_quiz_score": 0.4,
                "last_remediation_quiz_score": None,
            },
            "remediation_cache": {
                "topic_intro::state_space": {
                    "cache_key": "topic_intro::state_space",
                    "target_node_id": "topic_intro",
                    "weak_concepts": ["state_space"],
                    "lesson_artifact": {"response": "lesson"},
                    "mini_quiz_artifact": {"questions": []},
                    "created_at": "2026-04-29T10:00:00Z",
                }
            },
        },
    )

    state = await store.get_student_state("session-1", "intro-ai")
    assert state["active_remediation"]["target_node_id"] == "topic_intro"
    assert "topic_intro::state_space" in state["remediation_cache"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py::test_upsert_and_read_student_state_preserves_active_remediation -v`
Expected: FAIL because remediation fields are not persisted or returned.

- [ ] **Step 3: Extend student state persistence with remediation fields**

```python
# deeptutor/services/session/sqlite_store.py
state = {
    "current_node_id": current_node_id,
    "mastered_nodes": mastered_nodes,
    "explored_nodes": explored_nodes,
    "weak_node_ids": weak_node_ids,
    "dynamic_nodes": dynamic_nodes,
    "active_remediation": active_remediation,
    "remediation_cache": remediation_cache,
}
```

```python
# when saving state
active_remediation_json = json.dumps(state.get("active_remediation"))
remediation_cache_json = json.dumps(state.get("remediation_cache", {}))
```

- [ ] **Step 4: Run the targeted persistence test**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py::test_upsert_and_read_student_state_preserves_active_remediation -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/session/sqlite_store.py tests/services/session/test_sqlite_store.py
git commit -m "feat: persist graph remediation state"
```

## Task 5: Evaluate graph-linked quiz results into remediation state

**Files:**
- Modify: `deeptutor/api/routers/sessions.py`
- Modify: `tests/api/test_notebook_router.py`
- Modify: `deeptutor/services/graph/quiz_policy.py`
- Modify: `deeptutor/services/graph/remediation.py`

- [ ] **Step 1: Write the failing graph quiz result tests**

```python
def test_submit_graph_quiz_failure_creates_active_remediation(client: TestClient, store: SQLiteSessionStore) -> None:
    payload = {
        "results": [
            {"question_id": "q1", "is_correct": False},
            {"question_id": "q2", "is_correct": True},
            {"question_id": "q3", "is_correct": False},
        ],
        "graph_context": {
            "course_id": "intro-ai",
            "node_id": "topic_search",
            "quiz_kind": "node_quiz",
            "node_difficulty": "easy",
            "question_concept_map": {
                "q1": ["state_space"],
                "q2": ["state_space"],
                "q3": ["search_tree"],
            },
        },
    }

    response = client.post("/api/v1/sessions/session-1/quiz-results", json=payload)
    assert response.status_code == 200

    state = asyncio.run(store.get_student_state("session-1", "intro-ai"))
    assert state["active_remediation"]["source_node_id"] == "topic_search"
    assert state["active_remediation"]["status"] == "recommended"
    assert sorted(state["active_remediation"]["weak_concepts"]) == ["search_tree", "state_space"]
```

```python
def test_submit_graph_quiz_success_clears_completed_remediation(client: TestClient, store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.save_student_state(
            "session-1",
            "intro-ai",
            {
                "current_node_id": "topic_search",
                "mastered_nodes": [],
                "explored_nodes": ["topic_search"],
                "weak_node_ids": ["topic_search"],
                "dynamic_nodes": [],
                "active_remediation": {
                    "source_node_id": "topic_search",
                    "target_node_id": "topic_intro",
                    "weak_concepts": ["state_space"],
                    "failure_severity": "moderate",
                    "status": "passed_mini_quiz",
                    "attempt_count": 0,
                    "last_node_quiz_score": 0.4,
                    "last_remediation_quiz_score": 1.0,
                },
                "remediation_cache": {},
            },
        )
    )

    payload = {
        "results": [
            {"question_id": "q1", "is_correct": True},
            {"question_id": "q2", "is_correct": True},
            {"question_id": "q3", "is_correct": True},
        ],
        "graph_context": {
            "course_id": "intro-ai",
            "node_id": "topic_search",
            "quiz_kind": "node_quiz",
            "node_difficulty": "easy",
            "question_concept_map": {"q1": ["state_space"]},
        },
    }

    response = client.post("/api/v1/sessions/session-1/quiz-results", json=payload)
    assert response.status_code == 200

    state = asyncio.run(store.get_student_state("session-1", "intro-ai"))
    assert state["active_remediation"] is None
    assert "topic_search" in state["mastered_nodes"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/test_notebook_router.py::test_submit_graph_quiz_failure_creates_active_remediation tests/api/test_notebook_router.py::test_submit_graph_quiz_success_clears_completed_remediation -v`
Expected: FAIL because quiz result handling does not create or clear remediation state yet.

- [ ] **Step 3: Add graph-quiz result evaluation in the sessions router**

```python
# deeptutor/api/routers/sessions.py
graph_context = payload.graph_context or {}
quiz_kind = graph_context.get("quiz_kind")
if graph_context.get("course_id") and graph_context.get("node_id") and quiz_kind == "node_quiz":
    question_count = len(payload.results)
    correct_count = sum(1 for result in payload.results if result.is_correct)
    score_ratio = correct_count / question_count if question_count else 0.0
    pass_threshold = determine_graph_quiz_pass_threshold(question_count)
    passed = correct_count >= pass_threshold
    weak_concepts = sorted(
        {
            concept
            for result in payload.results
            if not result.is_correct
            for concept in graph_context.get("question_concept_map", {}).get(result.question_id, [])
        }
    )

    state = await store.get_student_state(session_id, graph_context["course_id"]) or {
        "current_node_id": "",
        "mastered_nodes": [],
        "explored_nodes": [],
        "weak_node_ids": [],
        "dynamic_nodes": [],
        "active_remediation": None,
        "remediation_cache": {},
    }

    if passed:
        state = clear_completed_remediation(state, passed_node_id=graph_context["node_id"])
    else:
        severity = determine_failure_severity(
            score_ratio=score_ratio,
            weak_concepts=weak_concepts,
            prerequisite_weakness=bool(graph_context.get("prerequisite_weakness")),
        )
        target = resolve_remediation_target(
            graph=graph,
            source_node_id=graph_context["node_id"],
            weak_concepts=weak_concepts,
            mastered_nodes=state.get("mastered_nodes", []),
            prerequisite_weakness=bool(graph_context.get("prerequisite_weakness")),
        )
        state = create_or_update_remediation_state(
            state,
            source_node_id=graph_context["node_id"],
            target_node_id=target["target_node_id"],
            weak_concepts=target["weak_concepts"],
            failure_severity=severity,
            score_ratio=score_ratio,
        )

    await store.save_student_state(session_id, graph_context["course_id"], state)
```

- [ ] **Step 4: Run the targeted graph quiz result tests**

Run: `.venv/bin/python -m pytest tests/api/test_notebook_router.py::test_submit_graph_quiz_failure_creates_active_remediation tests/api/test_notebook_router.py::test_submit_graph_quiz_success_clears_completed_remediation -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/sessions.py deeptutor/services/graph/quiz_policy.py deeptutor/services/graph/remediation.py tests/api/test_notebook_router.py
git commit -m "feat: track remediation from graph quiz results"
```

## Task 6: Support remediation artifact metadata through capability/runtime flow

**Files:**
- Modify: `deeptutor/capabilities/request_contracts.py`
- Modify: `deeptutor/services/session/turn_runtime.py`
- Modify: `deeptutor/capabilities/deep_question.py`
- Create: `tests/capabilities/test_deep_question_remediation.py`
- Modify: `web/lib/quiz-types.ts`
- Modify: `web/tests/quiz-types.test.ts`

- [ ] **Step 1: Write the failing remediation artifact tests**

```python
def test_deep_question_remediation_mode_preserves_graph_metadata() -> None:
    artifact = build_remediation_artifact(
        topic="Search",
        graph_context={
            "course_id": "intro-ai",
            "node_id": "topic_search",
            "quiz_kind": "remediation_quiz",
            "target_node_id": "topic_intro",
            "weak_concepts": ["state_space"],
        },
    )

    assert artifact["graph_context"]["quiz_kind"] == "remediation_quiz"
    assert artifact["graph_context"]["target_node_id"] == "topic_intro"
```

```ts
test("extractQuizQuestions preserves remediation quiz metadata", async () => {
  const { extractQuizQuestions } = await import("../lib/quiz-types.ts");
  const questions = extractQuizQuestions({
    questions: [
      {
        question_id: "q1",
        type: "multiple_choice",
        prompt: "Question",
        options: ["A", "B"],
        answer: "A",
      },
    ],
    graph_context: {
      course_id: "intro-ai",
      node_id: "topic_search",
      quiz_kind: "remediation_quiz",
      target_node_id: "topic_intro",
      weak_concepts: ["state_space"],
    },
  });

  assert.equal(questions[0]?.graph_context?.quiz_kind, "remediation_quiz");
  assert.equal(questions[0]?.graph_context?.target_node_id, "topic_intro");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/capabilities/test_deep_question_remediation.py -v`
Run: `node --experimental-strip-types --test web/tests/quiz-types.test.ts`
Expected: FAIL because remediation graph metadata is not yet supported end-to-end.

- [ ] **Step 3: Add remediation-capable graph metadata handling**

```python
# deeptutor/capabilities/request_contracts.py
ALLOWED_RUNTIME_KEYS = {
    "graph_context",
    "remediation_context",
}
```

```python
# deeptutor/capabilities/deep_question.py
artifact["graph_context"] = {
    **graph_context,
    "quiz_kind": graph_context.get("quiz_kind", "node_quiz"),
    "target_node_id": graph_context.get("target_node_id"),
    "weak_concepts": graph_context.get("weak_concepts", []),
}
```

```ts
// web/lib/quiz-types.ts
export interface GraphQuizContext {
  course_id: string;
  node_id: string;
  quiz_kind?: "node_quiz" | "remediation_quiz";
  target_node_id?: string;
  weak_concepts?: string[];
  node_difficulty?: string;
}
```

- [ ] **Step 4: Run the remediation metadata tests**

Run: `.venv/bin/python -m pytest tests/capabilities/test_deep_question_remediation.py -v`
Run: `node --experimental-strip-types --test web/tests/quiz-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/capabilities/request_contracts.py deeptutor/services/session/turn_runtime.py deeptutor/capabilities/deep_question.py tests/capabilities/test_deep_question_remediation.py web/lib/quiz-types.ts web/tests/quiz-types.test.ts
git commit -m "feat: preserve remediation quiz metadata"
```

## Task 7: Add remediation artifact cache helpers and API-facing session types

**Files:**
- Modify: `web/lib/session-api.ts`
- Modify: `deeptutor/services/graph/remediation.py`
- Modify: `tests/services/graph/test_remediation.py`

- [ ] **Step 1: Write the failing cache helper tests**

```python
from deeptutor.services.graph.remediation import build_remediation_cache_key


def test_build_remediation_cache_key_uses_target_and_sorted_concepts() -> None:
    key = build_remediation_cache_key("topic_intro", ["search_tree", "state_space"])
    assert key == "topic_intro::search_tree|state_space"
```

```ts
test("recordQuizResults accepts remediation graph context", async () => {
  const { recordQuizResults } = await import("../lib/session-api.ts");
  assert.equal(typeof recordQuizResults, "function");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_remediation.py::test_build_remediation_cache_key_uses_target_and_sorted_concepts -v`
Expected: FAIL because the cache-key helper does not exist yet.

- [ ] **Step 3: Add remediation cache-key helper and typed session payloads**

```python
def build_remediation_cache_key(target_node_id: str, weak_concepts: list[str]) -> str:
    normalized = "|".join(sorted({concept.strip() for concept in weak_concepts if concept.strip()}))
    return f"{target_node_id}::{normalized}"
```

```ts
export interface GraphQuizContext {
  course_id: string;
  node_id: string;
  quiz_kind?: "node_quiz" | "remediation_quiz";
  target_node_id?: string;
  weak_concepts?: string[];
  node_difficulty?: string;
  question_concept_map?: Record<string, string[]>;
}

export interface GraphQuizOutcome {
  course_id: string;
  node_id: string;
  quiz_kind: "node_quiz" | "remediation_quiz";
}
```

- [ ] **Step 4: Run the targeted tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_remediation.py::test_build_remediation_cache_key_uses_target_and_sorted_concepts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/remediation.py tests/services/graph/test_remediation.py web/lib/session-api.ts
git commit -m "feat: add remediation cache helpers"
```

## Task 8: Add failed-quiz CTA block and remediation actions in QuizViewer

**Files:**
- Modify: `web/components/quiz/QuizViewer.tsx`
- Create: `web/lib/remediation-ui.ts`
- Create: `web/tests/remediation-ui.test.ts`

- [ ] **Step 1: Write the failing remediation CTA formatter tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  describeRemediationCtaSet,
  describeRemediationStateBadge,
} from "../lib/remediation-ui.ts";

test("describeRemediationCtaSet returns the three failed-quiz actions", () => {
  assert.deepEqual(describeRemediationCtaSet(), [
    "Ôn lại phần yếu",
    "Làm lại quiz",
    "Quay lại graph",
  ]);
});

test("describeRemediationStateBadge formats remediation copy", () => {
  assert.equal(
    describeRemediationStateBadge("recommended"),
    "Cần ôn lại",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/remediation-ui.test.ts`
Expected: FAIL because the remediation UI helper file does not exist yet.

- [ ] **Step 3: Add remediation UI helpers and failed-quiz CTA block**

```ts
// web/lib/remediation-ui.ts
export function describeRemediationCtaSet(): string[] {
  return ["Ôn lại phần yếu", "Làm lại quiz", "Quay lại graph"];
}

export function describeRemediationStateBadge(status: string): string {
  if (status === "passed_mini_quiz") return "Sẵn sàng kiểm tra lại";
  return "Cần ôn lại";
}
```

```tsx
// web/components/quiz/QuizViewer.tsx
const failedGraphQuiz = graphContext?.quiz_kind === "node_quiz" && completedCount === total && !currentQuizPassed;

{failedGraphQuiz ? (
  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <div className="text-sm font-semibold text-amber-900">Bạn chưa vượt qua nút này</div>
    <p className="mt-1 text-sm text-amber-800">
      Hệ thống phát hiện phần còn yếu và có thể giúp bạn ôn lại trước khi làm tiếp.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button onClick={handleStartRemediation}>Ôn lại phần yếu</button>
      <button onClick={handleRetryCurrentQuiz}>Làm lại quiz</button>
      <button onClick={handleBackToGraph}>Quay lại graph</button>
    </div>
  </div>
) : null}
```

- [ ] **Step 4: Run the remediation UI tests**

Run: `node --experimental-strip-types --test web/tests/remediation-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/components/quiz/QuizViewer.tsx web/lib/remediation-ui.ts web/tests/remediation-ui.test.ts
git commit -m "feat: add remediation CTA flow to quiz viewer"
```

## Task 9: Generate remediation lesson and remediation mini-quiz in chat flow

**Files:**
- Modify: `web/lib/knowledge-graph-actions.ts`
- Modify: `web/components/quiz/QuizViewer.tsx`
- Modify: `deeptutor/capabilities/deep_question.py`
- Modify: `tests/capabilities/test_deep_question_remediation.py`

- [ ] **Step 1: Write the failing remediation generation tests**

```python
def test_remediation_request_generates_multiple_choice_quiz_artifact() -> None:
    artifact = build_remediation_artifact(
        topic="Search",
        graph_context={
            "course_id": "intro-ai",
            "node_id": "topic_search",
            "quiz_kind": "remediation_quiz",
            "node_difficulty": "easy",
            "weak_concepts": ["state_space"],
        },
        question_count=2,
    )

    assert all(question["type"] == "multiple_choice" for question in artifact["questions"])
    assert len(artifact["questions"]) == 2
```

```ts
test("buildGraphRemediationRequest creates a remediation lesson payload", async () => {
  const { buildGraphRemediationRequest } = await import("../lib/knowledge-graph-actions.ts");
  const request = buildGraphRemediationRequest({
    courseId: "intro-ai",
    sourceNodeId: "topic_search",
    targetNodeId: "topic_intro",
    weakConcepts: ["state_space"],
    nodeDifficulty: "easy",
    attemptCount: 0,
  });

  assert.equal(request.graph_context?.quiz_kind, "remediation_quiz");
  assert.equal(request.graph_context?.target_node_id, "topic_intro");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/capabilities/test_deep_question_remediation.py::test_remediation_request_generates_multiple_choice_quiz_artifact -v`
Expected: FAIL because remediation generation path is not implemented.

- [ ] **Step 3: Add remediation request builder and generation path**

```ts
// web/lib/knowledge-graph-actions.ts
export function buildGraphRemediationRequest(input: {
  courseId: string;
  sourceNodeId: string;
  targetNodeId: string;
  weakConcepts: string[];
  nodeDifficulty: string;
  attemptCount: number;
}) {
  return {
    mode: "quiz",
    preference: "multiple_choice only",
    graph_context: {
      course_id: input.courseId,
      node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      weak_concepts: input.weakConcepts,
      node_difficulty: input.nodeDifficulty,
      quiz_kind: "remediation_quiz",
      requested_question_count: determineRemediationQuizCount(input.nodeDifficulty, input.attemptCount),
    },
  };
}
```

```python
# deeptutor/capabilities/deep_question.py
if graph_context.get("quiz_kind") == "remediation_quiz":
    question_count = int(graph_context.get("requested_question_count", 2))
    artifact["questions"] = [
        {
            "question_id": f"remediation_{idx + 1}",
            "type": "multiple_choice",
            "prompt": prompt,
            "options": options,
            "answer": answer,
        }
        for idx in range(question_count)
    ]
```

- [ ] **Step 4: Run the remediation generation tests**

Run: `.venv/bin/python -m pytest tests/capabilities/test_deep_question_remediation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/knowledge-graph-actions.ts web/components/quiz/QuizViewer.tsx deeptutor/capabilities/deep_question.py tests/capabilities/test_deep_question_remediation.py
git commit -m "feat: generate remediation lesson and quiz artifacts"
```

## Task 10: Persist remediation mini-quiz outcomes and cache reuse

**Files:**
- Modify: `deeptutor/api/routers/sessions.py`
- Modify: `deeptutor/services/graph/remediation.py`
- Modify: `tests/api/test_notebook_router.py`

- [ ] **Step 1: Write the failing remediation mini-quiz tests**

```python
def test_submit_remediation_quiz_success_marks_passed_mini_quiz(client: TestClient, store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.save_student_state(
            "session-1",
            "intro-ai",
            {
                "current_node_id": "topic_search",
                "mastered_nodes": ["topic_intro"],
                "explored_nodes": ["topic_search"],
                "weak_node_ids": ["topic_search"],
                "dynamic_nodes": [],
                "active_remediation": {
                    "source_node_id": "topic_search",
                    "target_node_id": "topic_intro",
                    "weak_concepts": ["state_space"],
                    "failure_severity": "moderate",
                    "status": "mini_quiz_ready",
                    "attempt_count": 0,
                    "last_node_quiz_score": 0.4,
                    "last_remediation_quiz_score": None,
                },
                "remediation_cache": {},
            },
        )
    )

    payload = {
        "results": [
            {"question_id": "q1", "is_correct": True},
            {"question_id": "q2", "is_correct": True},
        ],
        "graph_context": {
            "course_id": "intro-ai",
            "node_id": "topic_search",
            "target_node_id": "topic_intro",
            "quiz_kind": "remediation_quiz",
            "node_difficulty": "easy",
            "weak_concepts": ["state_space"],
        },
    }

    response = client.post("/api/v1/sessions/session-1/quiz-results", json=payload)
    assert response.status_code == 200

    state = asyncio.run(store.get_student_state("session-1", "intro-ai"))
    assert state["active_remediation"]["status"] == "passed_mini_quiz"
```

```python
def test_submit_remediation_quiz_failure_increments_attempt_count(client: TestClient, store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.save_student_state(
            "session-1",
            "intro-ai",
            {
                "current_node_id": "topic_search",
                "mastered_nodes": ["topic_intro"],
                "explored_nodes": ["topic_search"],
                "weak_node_ids": ["topic_search"],
                "dynamic_nodes": [],
                "active_remediation": {
                    "source_node_id": "topic_search",
                    "target_node_id": "topic_intro",
                    "weak_concepts": ["state_space"],
                    "failure_severity": "moderate",
                    "status": "mini_quiz_ready",
                    "attempt_count": 0,
                    "last_node_quiz_score": 0.4,
                    "last_remediation_quiz_score": None,
                },
                "remediation_cache": {},
            },
        )
    )

    payload = {
        "results": [
            {"question_id": "q1", "is_correct": False},
            {"question_id": "q2", "is_correct": False},
        ],
        "graph_context": {
            "course_id": "intro-ai",
            "node_id": "topic_search",
            "target_node_id": "topic_intro",
            "quiz_kind": "remediation_quiz",
            "node_difficulty": "easy",
            "weak_concepts": ["state_space"],
        },
    }

    response = client.post("/api/v1/sessions/session-1/quiz-results", json=payload)
    assert response.status_code == 200

    state = asyncio.run(store.get_student_state("session-1", "intro-ai"))
    assert state["active_remediation"]["attempt_count"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/test_notebook_router.py::test_submit_remediation_quiz_success_marks_passed_mini_quiz tests/api/test_notebook_router.py::test_submit_remediation_quiz_failure_increments_attempt_count -v`
Expected: FAIL because remediation quiz result handling is missing.

- [ ] **Step 3: Add remediation mini-quiz result transitions**

```python
# deeptutor/services/graph/remediation.py
def mark_remediation_mini_quiz_failed(
    current_state: dict[str, object],
    *,
    score_ratio: float,
) -> dict[str, object]:
    next_state = dict(current_state)
    active = dict(next_state.get("active_remediation") or {})
    active["status"] = "recommended"
    active["attempt_count"] = int(active.get("attempt_count", 0)) + 1
    active["last_remediation_quiz_score"] = score_ratio
    next_state["active_remediation"] = active
    return next_state
```

```python
# deeptutor/api/routers/sessions.py
if graph_context.get("quiz_kind") == "remediation_quiz":
    pass_threshold = determine_graph_quiz_pass_threshold(question_count)
    passed = correct_count >= pass_threshold
    if passed:
        state = mark_remediation_mini_quiz_passed(state, score_ratio=score_ratio)
    else:
        state = mark_remediation_mini_quiz_failed(state, score_ratio=score_ratio)
    await store.save_student_state(session_id, graph_context["course_id"], state)
```

- [ ] **Step 4: Run the remediation mini-quiz tests**

Run: `.venv/bin/python -m pytest tests/api/test_notebook_router.py::test_submit_remediation_quiz_success_marks_passed_mini_quiz tests/api/test_notebook_router.py::test_submit_remediation_quiz_failure_increments_attempt_count -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/sessions.py deeptutor/services/graph/remediation.py tests/api/test_notebook_router.py
git commit -m "feat: track remediation mini quiz outcomes"
```

## Task 11: Render remediation state in graph and recommendation UI

**Files:**
- Modify: `web/lib/course-knowledge-graph.ts`
- Modify: `web/lib/graph-recommendation-ui.ts`
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/NodeDetailPanel.tsx`
- Modify: `web/tests/course-knowledge-graph.test.ts`
- Modify: `web/tests/graph-recommendation-ui.test.ts`

- [ ] **Step 1: Write the failing remediation graph UI tests**

```ts
test("mapCourseKnowledgeGraphToFlow marks remediation target nodes", async () => {
  const { mapCourseKnowledgeGraphToFlow } = await import("../lib/course-knowledge-graph.ts");

  const flow = mapCourseKnowledgeGraphToFlow(
    {
      nodes: [
        { node_id: "topic_intro", title: "Intro", node_type: "topic" },
        { node_id: "topic_search", title: "Search", node_type: "topic" },
      ],
      edges: [],
    },
    {
      recommendedNodeId: "topic_intro",
      remediationState: {
        sourceNodeId: "topic_search",
        targetNodeId: "topic_intro",
        status: "recommended",
      },
    },
  );

  const intro = flow.nodes.find((node) => node.id === "topic_intro");
  assert.equal(intro?.data?.graphState, "needs_remediation");
});
```

```ts
test("describeGraphRecommendation uses remediation copy for remediate mode", async () => {
  const { describeGraphRecommendation } = await import("../lib/graph-recommendation-ui.ts");
  const description = describeGraphRecommendation({
    recommended_node_id: "topic_intro",
    mode: "remediate",
    score: 0.99,
    reason_codes: ["recent_quiz_weakness"],
    backup_node_ids: ["topic_search"],
  });

  assert.equal(description.badge, "ÔN LẠI");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/graph-recommendation-ui.test.ts`
Expected: FAIL because remediation graph styling and copy are not implemented.

- [ ] **Step 3: Add remediation state styling and recommendation copy**

```ts
// web/lib/course-knowledge-graph.ts
if (options.remediationState?.targetNodeId === node.node_id) {
  graphState = "needs_remediation";
}
```

```ts
// web/lib/graph-recommendation-ui.ts
if (recommendation.mode === "remediate") {
  return {
    badge: "ÔN LẠI",
    message: "Bạn nên ôn lại phần còn yếu trước khi tiếp tục học sang nút kế tiếp.",
  };
}
```

```tsx
// web/components/graph/NodeDetailPanel.tsx
{node.graphState === "needs_remediation" ? (
  <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
    Nút này đang ở trạng thái remediation. Hãy ôn lại phần yếu và vượt qua bài kiểm tra lại để xóa trạng thái này.
  </div>
) : null}
```

- [ ] **Step 4: Run the remediation graph UI tests**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/graph-recommendation-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/course-knowledge-graph.ts web/lib/graph-recommendation-ui.ts web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx web/tests/course-knowledge-graph.test.ts web/tests/graph-recommendation-ui.test.ts
git commit -m "feat: render remediation state in graph UI"
```

## Task 12: Run full verification and document execution handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-04-29-mastery-remediation-loop.md`

- [ ] **Step 1: Run the full backend verification suite**

Run: `.venv/bin/python -m pytest tests/services/graph/test_quiz_policy.py tests/services/graph/test_remediation.py tests/services/graph/test_recommendation.py tests/services/session/test_sqlite_store.py tests/api/test_notebook_router.py tests/api/routers/test_node_progress.py tests/capabilities/test_deep_question_remediation.py tests/api/routers/test_graph_recommendation.py -q`
Expected: PASS

- [ ] **Step 2: Run the full frontend verification suite**

Run: `node --experimental-strip-types --test web/tests/remediation-ui.test.ts web/tests/quiz-types.test.ts web/tests/course-knowledge-graph.test.ts web/tests/graph-recommendation-ui.test.ts`
Expected: PASS

- [ ] **Step 3: Update the plan checklist and verify no unstaged docs drift remains**

Run: `git status --short`
Expected: either clean or only the files intended for the current final commit.

- [ ] **Step 4: Commit the final verification adjustments if needed**

```bash
git add docs/superpowers/plans/2026-04-29-mastery-remediation-loop.md
git commit -m "chore: finalize mastery remediation loop verification"
```
