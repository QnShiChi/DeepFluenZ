# Adaptive Next-Step Tutor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-session knowledge-state engine that turns quiz, remediation, retry, and hint signals into deterministic tutor next-step decisions, then surfaces those decisions through backend APIs, `course_assistant`, the Knowledge Graph UI, and the quiz flow.

**Architecture:** Keep the adaptive tutor as a graph-domain service layer instead of a new capability. Normalize learning signals into a small session knowledge state, update bounded node scores deterministically, then run a score-based policy that returns one `NextStepDecision` contract with reason tags and explanation text. Persist the lightweight session state alongside existing student graph state so both the session routers and the frontend can read the current tutor decision without rebuilding the policy on every client render.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session store, pytest, TypeScript, React/Next.js, Node test runner, existing graph recommendation/remediation/timeline infrastructure

---

## File Structure

### Backend graph domain

- Modify: `deeptutor/services/graph/models.py`
  - add typed literals and Pydantic models for session knowledge state, knowledge signals, and next-step decisions
- Create: `deeptutor/services/graph/session_knowledge_state.py`
  - build signals, update node scores, clamp ranges, and evaluate the next-step policy
- Create: `tests/services/graph/test_session_knowledge_state.py`
  - unit coverage for signal normalization, score updates, and decision thresholds

### Backend persistence and state exposure

- Modify: `deeptutor/services/session/sqlite_store.py`
  - persist `in_session_knowledge_state_json` in `student_graph_states`
- Modify: `deeptutor/api/routers/node_progress.py`
  - expose `in_session_knowledge_state` and `next_step_decision`
- Modify: `tests/services/session/test_sqlite_store.py`
  - verify round-trip persistence for knowledge state and current decision fields
- Modify: `tests/api/routers/test_node_progress.py`
  - verify API exposure for the new state snapshot

### Backend quiz, recommendation, and capability integration

- Modify: `deeptutor/api/routers/sessions.py`
  - emit normalized signals after graph quiz and remediation transitions, update the stored in-session state, and append tutor-decision timeline events
- Modify: `deeptutor/api/routers/graph_recommendation.py`
  - include current recommendation context when the tutor policy targets `advance`
- Modify: `deeptutor/capabilities/request_contracts.py`
  - validate runtime-only next-step tutor payloads for `course_assistant`
- Modify: `deeptutor/capabilities/course_assistant.py`
  - bias live responses toward explain, micro-quiz, remediation, or prerequisite fallback according to the stored decision
- Modify: `tests/api/routers/test_sessions_graph_quiz.py`
  - verify signal-driven state transitions and timeline emission
- Modify: `tests/api/routers/test_graph_recommendation.py`
  - verify recommendation responses remain stable while carrying tutor-aware context
- Modify: `tests/capabilities/test_request_contracts.py`
  - verify runtime config accepts and strips next-step tutor payloads
- Create: `tests/capabilities/test_course_assistant_next_step.py`
  - verify course assistant prompt shaping for tutor actions

### Frontend integration

- Modify: `web/lib/session-api.ts`
  - carry `next_step_decision` and `in_session_knowledge_state` in graph quiz responses
- Modify: `web/lib/node-progress-api.ts`
  - type and normalize the new snapshot returned by node-progress reads
- Create: `web/lib/next-step-tutor-ui.ts`
  - map actions and reason tags to concise learner-facing copy and CTA labels
- Modify: `web/components/quiz/QuizViewer.tsx`
  - render a tutor-decision block after graph quiz or remediation outcomes
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - show the current tutor recommendation near the graph workspace and refresh it after relevant actions
- Modify: `web/components/graph/NodeDetailPanel.tsx`
  - show tutor action messaging when the selected node matches the targeted node
- Create: `web/tests/next-step-tutor-ui.test.ts`
  - verify action/reason formatting and CTA mapping
- Modify: `web/tests/knowledge-graph-progress.test.ts`
  - verify the progress snapshot parser carries the new fields
- Modify: `web/tests/learning-timeline-drawer.test.tsx`
  - verify tutor-decision timeline entries render correctly

## Task 1: Add graph-domain session knowledge models and policy engine

**Files:**
- Modify: `deeptutor/services/graph/models.py`
- Create: `deeptutor/services/graph/session_knowledge_state.py`
- Create: `tests/services/graph/test_session_knowledge_state.py`

- [ ] **Step 1: Write the failing session knowledge tests**

```python
from deeptutor.services.graph.models import SessionKnowledgeState
from deeptutor.services.graph.session_knowledge_state import (
    apply_knowledge_signal,
    build_knowledge_signal,
    evaluate_next_step_decision,
)


def test_apply_knowledge_signal_updates_scores_for_quiz_failure() -> None:
    state = SessionKnowledgeState.model_validate(
        {
            "session_id": "session-1",
            "course_id": "intro-ai",
            "active_node_id": "topic_search",
            "nodes": {},
        }
    )

    signal = build_knowledge_signal(
        signal_type="quiz_failed",
        node_id="topic_search",
        score_ratio=0.33,
        metadata={"weak_concepts": ["state_space"]},
    )
    updated = apply_knowledge_signal(state, signal)
    node_state = updated.nodes["topic_search"]

    assert round(node_state.mastery_score, 2) == -0.35
    assert round(node_state.stuck_score, 2) == 0.25
    assert node_state.last_outcome == "fail"


def test_evaluate_next_step_decision_prefers_prerequisite_fallback_when_risk_is_high() -> None:
    state = SessionKnowledgeState.model_validate(
        {
            "session_id": "session-1",
            "course_id": "intro-ai",
            "active_node_id": "topic_search",
            "nodes": {
                "topic_search": {
                    "mastery_score": -0.4,
                    "stuck_score": 0.55,
                    "prerequisite_risk": 0.85,
                    "confidence_score": 0.2,
                    "attempt_count": 2,
                    "hint_count": 1,
                    "last_outcome": "fail",
                    "recent_signals": ["quiz_failed", "remediation_failed"],
                }
            },
        }
    )

    decision = evaluate_next_step_decision(
        state,
        target_node_id="topic_search",
        prerequisite_node_id="topic_intro",
        recommended_next_node_id="topic_planning",
    )

    assert decision.action == "fallback_to_prerequisite"
    assert decision.target_node_id == "topic_intro"
    assert "prerequisite_risk_high" in decision.reason_tags
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_session_knowledge_state.py -v`
Expected: FAIL with `ImportError` or `AttributeError` because the session knowledge models and helpers do not exist yet.

- [ ] **Step 3: Add the minimal models and score-based policy engine**

```python
# deeptutor/services/graph/models.py
KnowledgeSignalType = Literal[
    "quiz_passed",
    "quiz_failed",
    "hint_requested",
    "retry_requested",
    "remediation_completed",
    "remediation_failed",
]
NextStepAction = Literal[
    "advance",
    "stay_and_explain",
    "give_micro_quiz",
    "start_targeted_remediation",
    "fallback_to_prerequisite",
]
NextStepReasonTag = Literal[
    "mastery_high",
    "mastery_uncertain",
    "recent_failure",
    "retry_loop_detected",
    "hint_dependence",
    "prerequisite_risk_high",
    "remediation_recovered",
    "ready_to_advance",
]


class NodeKnowledgeState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mastery_score: float = 0.0
    stuck_score: float = 0.0
    prerequisite_risk: float = 0.0
    confidence_score: float = 0.5
    attempt_count: int = 0
    hint_count: int = 0
    last_outcome: str = ""
    recent_signals: list[str] = Field(default_factory=list)
    last_interacted_at: str = ""


class KnowledgeSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal_type: KnowledgeSignalType
    node_id: str
    score_ratio: float | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class NextStepDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: NextStepAction
    target_node_id: str = ""
    reason_tags: list[NextStepReasonTag] = Field(default_factory=list)
    explanation_summary: str = ""
    recommended_difficulty: str = ""
    should_record_timeline: bool = True


class SessionKnowledgeState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    course_id: str
    active_node_id: str = ""
    nodes: dict[str, NodeKnowledgeState] = Field(default_factory=dict)
    last_policy_action: str = ""
    last_policy_reason_tags: list[str] = Field(default_factory=list)
    next_step_decision: NextStepDecision | None = None
    last_updated_at: str = ""
```

```python
# deeptutor/services/graph/session_knowledge_state.py
from __future__ import annotations

from copy import deepcopy

from deeptutor.services.graph.models import (
    KnowledgeSignal,
    NextStepDecision,
    NodeKnowledgeState,
    SessionKnowledgeState,
)


def build_knowledge_signal(
    *,
    signal_type: str,
    node_id: str,
    score_ratio: float | None = None,
    metadata: dict[str, object] | None = None,
) -> KnowledgeSignal:
    return KnowledgeSignal(
        signal_type=signal_type,
        node_id=node_id,
        score_ratio=score_ratio,
        metadata=metadata or {},
    )


def apply_knowledge_signal(
    state: SessionKnowledgeState,
    signal: KnowledgeSignal,
) -> SessionKnowledgeState:
    updated = state.model_copy(deep=True)
    node_state = deepcopy(updated.nodes.get(signal.node_id, NodeKnowledgeState()))

    if signal.signal_type == "quiz_failed":
        node_state.mastery_score = max(-1.0, node_state.mastery_score - 0.35)
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.25)
        node_state.attempt_count += 1
        node_state.last_outcome = "fail"
    elif signal.signal_type == "quiz_passed":
        node_state.mastery_score = min(1.0, node_state.mastery_score + 0.4)
        node_state.stuck_score = max(0.0, node_state.stuck_score - 0.2)
        node_state.confidence_score = min(1.0, node_state.confidence_score + 0.2)
        node_state.last_outcome = "pass"
    elif signal.signal_type == "hint_requested":
        node_state.hint_count += 1
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.1)
        node_state.confidence_score = max(0.0, node_state.confidence_score - 0.1)
    elif signal.signal_type == "retry_requested":
        node_state.attempt_count += 1
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.15)
    elif signal.signal_type == "remediation_failed":
        node_state.prerequisite_risk = min(1.0, node_state.prerequisite_risk + 0.25)
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.2)
        node_state.last_outcome = "fail"
    elif signal.signal_type == "remediation_completed":
        node_state.mastery_score = min(1.0, node_state.mastery_score + 0.3)
        node_state.prerequisite_risk = max(0.0, node_state.prerequisite_risk - 0.2)
        node_state.confidence_score = min(1.0, node_state.confidence_score + 0.15)
        node_state.last_outcome = "remediated"

    node_state.recent_signals = [*node_state.recent_signals[-4:], signal.signal_type]
    updated.nodes[signal.node_id] = node_state
    updated.active_node_id = signal.node_id
    return updated


def evaluate_next_step_decision(
    state: SessionKnowledgeState,
    *,
    target_node_id: str,
    prerequisite_node_id: str = "",
    recommended_next_node_id: str = "",
) -> NextStepDecision:
    node_state = state.nodes.get(target_node_id, NodeKnowledgeState())

    if node_state.prerequisite_risk >= 0.8 and prerequisite_node_id:
        return NextStepDecision(
            action="fallback_to_prerequisite",
            target_node_id=prerequisite_node_id,
            reason_tags=["prerequisite_risk_high", "recent_failure"],
            explanation_summary="He thong de xuat quay lai node tien quyet gan nhat.",
        )
    if node_state.stuck_score >= 0.65:
        return NextStepDecision(
            action="start_targeted_remediation",
            target_node_id=target_node_id,
            reason_tags=["retry_loop_detected", "recent_failure"],
            explanation_summary="He thong de xuat on lai phan yeu truoc khi di tiep.",
        )
    if node_state.mastery_score >= 0.45 and recommended_next_node_id:
        return NextStepDecision(
            action="advance",
            target_node_id=recommended_next_node_id,
            reason_tags=["mastery_high", "ready_to_advance"],
            explanation_summary="Ban da san sang chuyen sang buoc tiep theo.",
        )
    return NextStepDecision(
        action="give_micro_quiz",
        target_node_id=target_node_id,
        reason_tags=["mastery_uncertain"],
        explanation_summary="Lam them mot bai kiem tra ngan de xac nhan muc do hieu bai.",
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/graph/test_session_knowledge_state.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/models.py deeptutor/services/graph/session_knowledge_state.py tests/services/graph/test_session_knowledge_state.py
git commit -m "feat: add session knowledge state engine"
```

## Task 2: Persist in-session knowledge state and expose it through node progress

**Files:**
- Modify: `deeptutor/services/session/sqlite_store.py`
- Modify: `deeptutor/api/routers/node_progress.py`
- Modify: `tests/services/session/test_sqlite_store.py`
- Modify: `tests/api/routers/test_node_progress.py`

- [ ] **Step 1: Write the failing persistence and node-progress tests**

```python
def test_student_state_round_trips_in_session_knowledge_state(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.upsert_student_state(
            "session-1",
            "intro-ai",
            {
                "current_node_id": "topic_search",
                "mastered_nodes": [],
                "explored_nodes": ["topic_search"],
                "dynamic_nodes": [],
                "weak_node_ids": [],
                "active_remediation": None,
                "remediation_cache": {},
                "in_session_knowledge_state": {
                    "session_id": "session-1",
                    "course_id": "intro-ai",
                    "active_node_id": "topic_search",
                    "nodes": {
                        "topic_search": {
                            "mastery_score": 0.2,
                            "stuck_score": 0.1,
                            "prerequisite_risk": 0.0,
                            "confidence_score": 0.7,
                            "attempt_count": 1,
                            "hint_count": 0,
                            "last_outcome": "pass",
                            "recent_signals": ["quiz_passed"],
                        }
                    },
                    "next_step_decision": {
                        "action": "advance",
                        "target_node_id": "topic_planning",
                        "reason_tags": ["ready_to_advance"],
                        "explanation_summary": "Ban da san sang di tiep.",
                    },
                },
            },
        )
    )

    state = asyncio.run(store.get_student_state("session-1", "intro-ai"))

    assert state["in_session_knowledge_state"]["active_node_id"] == "topic_search"
    assert state["in_session_knowledge_state"]["next_step_decision"]["action"] == "advance"
```

```python
def test_get_node_progress_returns_in_session_knowledge_state(client: TestClient) -> None:
    response = client.get(
        "/api/v1/graph/node-progress/intro-ai",
        params={"session_id": "session-1"},
    )

    payload = response.json()
    assert payload["in_session_knowledge_state"]["active_node_id"] == "topic_search"
    assert payload["next_step_decision"]["action"] == "advance"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py tests/api/routers/test_node_progress.py -v`
Expected: FAIL because `in_session_knowledge_state` is not stored or returned yet.

- [ ] **Step 3: Add storage and response plumbing**

```python
# deeptutor/services/session/sqlite_store.py
CREATE TABLE IF NOT EXISTS student_graph_states (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES course_graph_templates(subject_id) ON DELETE CASCADE,
    current_node_id TEXT DEFAULT '',
    mastered_nodes_json TEXT DEFAULT '[]',
    dynamic_nodes_json TEXT DEFAULT '[]',
    explored_nodes_json TEXT DEFAULT '[]',
    weak_nodes_json TEXT DEFAULT '[]',
    active_remediation_json TEXT DEFAULT '',
    remediation_cache_json TEXT DEFAULT '{}',
    in_session_knowledge_state_json TEXT DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (session_id, subject_id)
);
```

```python
# deeptutor/services/session/sqlite_store.py
state_payload = {
    "current_node_id": current_node_id,
    "mastered_nodes_json": _json_dumps(mastered_nodes),
    "dynamic_nodes_json": _json_dumps(dynamic_nodes),
    "explored_nodes_json": _json_dumps(explored_nodes),
    "weak_nodes_json": _json_dumps(weak_node_ids),
    "active_remediation_json": _json_dumps(active_remediation) if active_remediation else "",
    "remediation_cache_json": _json_dumps(remediation_cache),
    "in_session_knowledge_state_json": _json_dumps(state.get("in_session_knowledge_state") or {}),
}
```

```python
# deeptutor/api/routers/node_progress.py
class NodeProgressResponse(BaseModel):
    progress: dict[str, str]
    current_node_id: str = ""
    dynamic_nodes: list[dict[str, object]] = []
    active_remediation: dict[str, object] | None = None
    in_session_knowledge_state: dict[str, object] | None = None
    next_step_decision: dict[str, object] | None = None


return NodeProgressResponse(
    progress=progress,
    current_node_id=str((state or {}).get("current_node_id", "") or ""),
    dynamic_nodes=list((state or {}).get("dynamic_nodes", []) or []),
    active_remediation=(state or {}).get("active_remediation"),
    in_session_knowledge_state=(state or {}).get("in_session_knowledge_state"),
    next_step_decision=((state or {}).get("in_session_knowledge_state") or {}).get("next_step_decision"),
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py tests/api/routers/test_node_progress.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/session/sqlite_store.py deeptutor/api/routers/node_progress.py tests/services/session/test_sqlite_store.py tests/api/routers/test_node_progress.py
git commit -m "feat: persist in-session tutor state"
```

## Task 3: Integrate signals and decisions into graph quiz and recommendation flows

**Files:**
- Modify: `deeptutor/api/routers/sessions.py`
- Modify: `deeptutor/api/routers/graph_recommendation.py`
- Modify: `tests/api/routers/test_sessions_graph_quiz.py`
- Modify: `tests/api/routers/test_graph_recommendation.py`

- [ ] **Step 1: Write the failing integration tests**

```python
def test_submit_graph_quiz_failure_updates_in_session_tutor_decision(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Tutor Session"))
    _seed_course(store)
    payload = sessions_module.QuizResultsRequest.model_validate(
        {
            "answers": _graph_quiz_answers([False, False, True]),
            "graph_context": {
                "course_id": "intro-ai",
                "node_id": "topic_search",
                "quiz_kind": "node_quiz",
                "node_difficulty": "easy",
                "question_concept_map": {"q1": ["state_space"], "q2": ["state_space"]},
                "prerequisite_node_id": "topic_intro",
            },
        }
    )

    asyncio.run(sessions_module.record_quiz_results(session["id"], payload))
    state = asyncio.run(store.get_student_state(session["id"], "intro-ai"))

    decision = state["in_session_knowledge_state"]["next_step_decision"]
    assert decision["action"] in {"start_targeted_remediation", "fallback_to_prerequisite"}
    assert "recent_failure" in decision["reason_tags"]
```

```python
def test_graph_recommendation_keeps_recommendation_and_does_not_override_tutor_action(client: TestClient) -> None:
    response = client.get(
        "/api/v1/graph/recommendation/intro-ai",
        params={"session_id": "session-1"},
    )

    payload = response.json()
    assert payload["recommended_node_id"] == "topic_search"
    assert payload["mode"] == "advance"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py -v`
Expected: FAIL because quiz-result handling does not update `in_session_knowledge_state` yet.

- [ ] **Step 3: Add signal emission, policy evaluation, and decision timeline writes**

```python
# deeptutor/api/routers/sessions.py
from deeptutor.services.graph.session_knowledge_state import (
    apply_knowledge_signal,
    build_knowledge_signal,
    evaluate_next_step_decision,
)
```

```python
# deeptutor/api/routers/sessions.py
knowledge_state_payload = state.get("in_session_knowledge_state") or {
    "session_id": session_id,
    "course_id": course_id,
    "active_node_id": node_id,
    "nodes": {},
}
knowledge_state = SessionKnowledgeState.model_validate(knowledge_state_payload)

signal = build_knowledge_signal(
    signal_type="quiz_passed" if passed else "quiz_failed",
    node_id=node_id,
    score_ratio=score_ratio,
    metadata={"quiz_kind": quiz_kind, "weak_concepts": weak_concepts},
)
knowledge_state = apply_knowledge_signal(knowledge_state, signal)

decision = evaluate_next_step_decision(
    knowledge_state,
    target_node_id=node_id,
    prerequisite_node_id=str(graph_context.get("prerequisite_node_id", "") or ""),
    recommended_next_node_id="",
)
knowledge_state.next_step_decision = decision
knowledge_state.last_policy_action = decision.action
knowledge_state.last_policy_reason_tags = list(decision.reason_tags)
state["in_session_knowledge_state"] = knowledge_state.model_dump()
await store.upsert_student_state(session_id, course_id, state)
```

```python
# deeptutor/api/routers/sessions.py
if decision.should_record_timeline:
    await store.append_learning_timeline_event(
        build_learning_event(
            event_id=f"next-step:{session_id}:{node_id}:{event_created_at}",
            session_id=session_id,
            course_id=course_id,
            node_id=decision.target_node_id or node_id,
            category="recommendation",
            event_type="recommendation_changed",
            summary=decision.explanation_summary,
            reason_tags=list(decision.reason_tags),
            details={
                "next_step_action": decision.action,
                "target_node_id": decision.target_node_id,
            },
            actions=[],
            highlighted=True,
            created_at=event_created_at,
        ).model_dump()
    )
```

# deeptutor/api/routers/sessions.py
return {
    "recorded": True,
    "notebook_count": notebook_count,
    "graph_updated": graph_updated,
    "next_step_decision": (
        (state.get("in_session_knowledge_state") or {}).get("next_step_decision")
        if course_id and node_id
        else None
    ),
    "in_session_knowledge_state": (
        state.get("in_session_knowledge_state") if course_id and node_id else None
    ),
}
```

```python
# deeptutor/api/routers/graph_recommendation.py
state = await store.get_student_state(session_id, course_id)
knowledge_state = ((state or {}).get("in_session_knowledge_state") or {})
current_decision = knowledge_state.get("next_step_decision") or {}

recommendation = recommend_next_graph_node(graph=graph, student_state=state)
if current_decision.get("action") == "advance" and current_decision.get("target_node_id"):
    recommendation = recommendation.model_copy(
        update={"recommended_node_id": str(current_decision["target_node_id"])}
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/sessions.py deeptutor/api/routers/graph_recommendation.py tests/api/routers/test_sessions_graph_quiz.py tests/api/routers/test_graph_recommendation.py
git commit -m "feat: connect next-step tutor to quiz flow"
```

## Task 4: Integrate next-step tutor decisions into `course_assistant`

**Files:**
- Modify: `deeptutor/capabilities/request_contracts.py`
- Modify: `deeptutor/capabilities/course_assistant.py`
- Modify: `tests/capabilities/test_request_contracts.py`
- Create: `tests/capabilities/test_course_assistant_next_step.py`

- [ ] **Step 1: Write the failing capability tests**

```python
def test_validate_course_assistant_request_config_strips_runtime_next_step_payload() -> None:
    config = validate_capability_config(
        "course_assistant",
        {
            "mode": "qa",
            "_persist_user_message": True,
            "next_step_decision": {"action": "stay_and_explain"},
        },
    )

    assert config["mode"] == "qa"
    assert "next_step_decision" not in config
```

```python
def test_build_next_step_hint_returns_structured_prompt_block() -> None:
    hint = CourseAssistantCapability()._build_next_step_hint(
        {
            "next_step_decision": {
                "action": "stay_and_explain",
                "target_node_id": "topic_search",
                "reason_tags": ["mastery_uncertain"],
                "explanation_summary": "Can giai thich lai ngan gon.",
            }
        }
    )

    assert "stay_and_explain" in hint
    assert "topic_search" in hint
    assert "Can giai thich lai ngan gon." in hint
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/capabilities/test_request_contracts.py tests/capabilities/test_course_assistant_next_step.py -v`
Expected: FAIL because request validation and course assistant logic do not understand next-step tutor payloads yet.

- [ ] **Step 3: Add runtime-only config support and prompt shaping**

```python
# deeptutor/capabilities/request_contracts.py
_RUNTIME_ONLY_KEYS = {
    "_persist_user_message",
    "followup_question_context",
    "graph_context",
    "next_step_decision",
    "in_session_knowledge_state",
}
```

```python
# deeptutor/capabilities/course_assistant.py
def _build_next_step_hint(self, config: dict[str, object]) -> str:
    decision = config.get("next_step_decision")
    if not isinstance(decision, dict):
        return ""

    action = str(decision.get("action", "") or "")
    target_node_id = str(decision.get("target_node_id", "") or "")
    explanation = str(decision.get("explanation_summary", "") or "")
    if not action:
        return ""

    return (
        "[NEXT_STEP_TUTOR]\n"
        f"action={action}\n"
        f"target_node_id={target_node_id}\n"
        f"explanation={explanation}\n"
        "Use this guidance to decide whether to explain, remediate, or advance.\n"
    )
```

```python
# deeptutor/capabilities/course_assistant.py
system_prompt_parts = [
    base_system_prompt,
    self._build_next_step_hint(context.config_overrides or {}),
]
system_prompt = "\n\n".join(part for part in system_prompt_parts if part)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/capabilities/test_request_contracts.py tests/capabilities/test_course_assistant_next_step.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/capabilities/request_contracts.py deeptutor/capabilities/course_assistant.py tests/capabilities/test_request_contracts.py tests/capabilities/test_course_assistant_next_step.py
git commit -m "feat: teach course assistant next-step tutor hints"
```

## Task 5: Surface tutor decisions in quiz and Knowledge Graph UI

**Files:**
- Modify: `web/lib/session-api.ts`
- Modify: `web/lib/node-progress-api.ts`
- Create: `web/lib/next-step-tutor-ui.ts`
- Modify: `web/components/quiz/QuizViewer.tsx`
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/NodeDetailPanel.tsx`
- Create: `web/tests/next-step-tutor-ui.test.ts`
- Modify: `web/tests/knowledge-graph-progress.test.ts`
- Modify: `web/tests/learning-timeline-drawer.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

```ts
import { describeNextStepDecision } from "@/lib/next-step-tutor-ui";

test("describeNextStepDecision returns remediation CTA copy", () => {
  expect(
    describeNextStepDecision({
      action: "start_targeted_remediation",
      target_node_id: "topic_search",
      reason_tags: ["recent_failure", "retry_loop_detected"],
      explanation_summary: "On lai phan yeu truoc khi di tiep.",
    }),
  ).toEqual({
    badge: "Tutor recommendation",
    ctaLabel: "On lai phan yeu",
    tone: "warning",
  });
});
```

```ts
test("normalizeNodeProgressSnapshot keeps next-step tutor payload", () => {
  const parsed = normalizeNodeProgressSnapshot({
    progress: { topic_search: "explored" },
    current_node_id: "topic_search",
    dynamic_nodes: [],
    active_remediation: null,
    in_session_knowledge_state: {
      active_node_id: "topic_search",
      next_step_decision: {
        action: "advance",
        target_node_id: "topic_planning",
        reason_tags: ["ready_to_advance"],
        explanation_summary: "Ban da san sang di tiep.",
      },
    },
    next_step_decision: {
      action: "advance",
      target_node_id: "topic_planning",
      reason_tags: ["ready_to_advance"],
      explanation_summary: "Ban da san sang di tiep.",
    },
  });

  expect(parsed.nextStepDecision?.action).toBe("advance");
  expect(parsed.nextStepDecision?.target_node_id).toBe("topic_planning");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/next-step-tutor-ui.test.ts web/tests/knowledge-graph-progress.test.ts web/tests/learning-timeline-drawer.test.tsx`
Expected: FAIL because the frontend has no typed tutor-decision helper or parser support yet.

- [ ] **Step 3: Add typed UI helpers and render blocks**

```ts
// web/lib/next-step-tutor-ui.ts
export type NextStepDecision = {
  action: "advance" | "stay_and_explain" | "give_micro_quiz" | "start_targeted_remediation" | "fallback_to_prerequisite";
  target_node_id: string;
  reason_tags: string[];
  explanation_summary: string;
};

export function describeNextStepDecision(decision: NextStepDecision) {
  const ctaByAction: Record<NextStepDecision["action"], string> = {
    advance: "Sang node tiep theo",
    stay_and_explain: "Giai thich lai ngan gon",
    give_micro_quiz: "Lam bai kiem tra ngan",
    start_targeted_remediation: "On lai phan yeu",
    fallback_to_prerequisite: "Quay lai node tien quyet",
  };

  return {
    badge: "Tutor recommendation",
    ctaLabel: ctaByAction[decision.action],
    tone: decision.action === "advance" ? "success" : decision.action === "give_micro_quiz" ? "info" : "warning",
    summary: decision.explanation_summary,
  };
}
```

```ts
// web/lib/session-api.ts
export interface QuizResultsResponse {
  recorded: boolean;
  notebook_count?: number;
  graph_updated?: boolean;
  next_step_decision?: Record<string, unknown> | null;
  in_session_knowledge_state?: Record<string, unknown> | null;
}

export async function recordQuizResults(
  sessionId: string,
  answers: QuizResultItem[],
  graphContext?: GraphQuizContext | null,
): Promise<QuizResultsResponse> {
  const response = await fetch(apiUrl(`/api/v1/sessions/${sessionId}/quiz-results`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answers,
      ...(graphContext ? { graph_context: graphContext } : {}),
    }),
  });
  return expectJson<QuizResultsResponse>(response);
}
```

```ts
// web/lib/node-progress-api.ts
export type NextStepDecisionSnapshot = {
  action: string;
  target_node_id: string;
  reason_tags: string[];
  explanation_summary: string;
};

export type NodeProgressSnapshot = {
  progress: Record<string, string>;
  current_node_id: string;
  dynamic_nodes: DynamicKnowledgeGraphNode[];
  active_remediation: ActiveGraphRemediationSnapshot | null;
  in_session_knowledge_state?: Record<string, unknown> | null;
  next_step_decision?: NextStepDecisionSnapshot | null;
};

export function normalizeNodeProgressSnapshot(data: Record<string, unknown>): NodeProgressSnapshot {
  return {
    progress: (data.progress ?? {}) as Record<string, NodeStatus>,
    current_node_id: String(data.current_node_id ?? ""),
    dynamic_nodes: (data.dynamic_nodes ?? []) as DynamicKnowledgeGraphNode[],
    active_remediation: (data.active_remediation ?? null) as ActiveGraphRemediationSnapshot | null,
    in_session_knowledge_state: (data.in_session_knowledge_state ?? null) as Record<string, unknown> | null,
    next_step_decision: (data.next_step_decision ?? null) as NextStepDecisionSnapshot | null,
  };
}
```

```tsx
// web/components/quiz/QuizViewer.tsx
const [nextStepDecision, setNextStepDecision] = useState<NextStepDecision | null>(null);

const result = await recordQuizResults(sessionId, answersPayload);
setNextStepDecision(result.next_step_decision ?? null);
```

```tsx
// web/components/quiz/QuizViewer.tsx
{nextStepDecision ? (
  <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
    <p className="font-semibold">{describeNextStepDecision(nextStepDecision).badge}</p>
    <p className="mt-1">{nextStepDecision.explanation_summary}</p>
    <button className="mt-3 rounded-full border px-3 py-1.5 text-xs font-medium">
      {describeNextStepDecision(nextStepDecision).ctaLabel}
    </button>
  </div>
) : null}
```

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx
const [nextStepDecision, setNextStepDecision] = useState<NextStepDecisionSnapshot | null>(null);

const progress = await getNodeProgress(sessionId, resolvedCourseId);
setNextStepDecision(progress.next_step_decision ?? null);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/next-step-tutor-ui.test.ts web/tests/knowledge-graph-progress.test.ts web/tests/learning-timeline-drawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/session-api.ts web/lib/node-progress-api.ts web/lib/next-step-tutor-ui.ts web/components/quiz/QuizViewer.tsx web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx web/tests/next-step-tutor-ui.test.ts web/tests/knowledge-graph-progress.test.ts web/tests/learning-timeline-drawer.test.tsx
git commit -m "feat: surface next-step tutor decisions in UI"
```
