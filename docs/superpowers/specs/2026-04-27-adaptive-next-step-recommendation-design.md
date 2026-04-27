# Adaptive Next-Step Recommendation Design

## Goal

Add an adaptive recommendation layer on top of the existing single-course Knowledge Graph so DeepTutor can suggest the most appropriate next node for a student to study within the imported course.

This feature is explicitly scoped to one imported course graph at a time. It does not attempt cross-course planning, career planning, or multi-course dependency analysis.

## Product Outcome

The Knowledge Graph stops being a static visualization and becomes a guided learning system that can:

- recommend the next node to study
- explain why that node is recommended
- react to quiz outcomes and progress state
- distinguish between advancing, reviewing, and remediating

## Scope

### In scope

- Single-course recommendation logic
- Rule-based candidate filtering
- Score-based ranking for eligible nodes
- Read-only recommendation API
- UI highlight for the recommended node
- Node detail messaging and action affordances
- Recompute recommendation after relevant student actions

### Out of scope

- Cross-course recommendations
- LLM-driven recommendation core logic
- Full mastery modeling with probabilistic student models
- Instructor analytics
- Cohort-level recommendation behavior

## Current Constraints

The current graph system already has:

- course graph templates with typed nodes and edges
- per-session course binding
- explored and mastered node tracking
- quiz generation from selected nodes
- node detail interactions in the workspace

The current system does not yet have:

- a dedicated recommendation service
- per-node mastery scores
- per-node quiz performance history
- a first-class recommendation API or UI

## Recommended Approach

Use a two-layer decision model:

1. Rule-based guardrails decide which nodes are eligible.
2. Score-based ranking selects the best next node among eligible candidates.

This balances correctness, explainability, and implementation speed.

## Why This Approach

Pure rule-based progression is easy to build but too rigid. Pure LLM-driven recommendation is costly, harder to debug, and too unstable for the core decision loop.

The chosen approach keeps the decision engine deterministic while still allowing adaptive behavior based on progress and recent weakness signals.

## Recommendation Modes

The recommendation engine returns one of three modes:

- `advance`: move forward in the course path
- `review`: revisit a previously explored but not yet secure node
- `remediate`: step back to a prerequisite or support node because the current area is weak

These modes are part of the public response because the UI should behave differently for each.

## Backend Architecture

Create a dedicated service:

- `deeptutor/services/graph/recommendation.py`

Responsibilities:

- load course graph and student graph state
- derive candidate nodes
- apply guardrails
- compute ranking scores
- emit one recommendation result with backup nodes and reason codes

This service should not own persistence. It should operate on already-loaded graph and session state objects.

## Candidate Selection

Candidate nodes are drawn from the current course graph under these rules:

- exclude nodes already in `mastered_nodes`
- prefer nodes reachable from the current frontier of the student path
- include direct downstream nodes whose prerequisites are largely satisfied
- include prerequisite ancestors of a recently failed node for remediation scenarios
- optionally include previously explored but non-mastered nodes for review scenarios

Dynamic nodes may be included later, but MVP should optimize for the imported static course graph first.

## Guardrails

Guardrails are applied before scoring:

- reject nodes with unsatisfied prerequisites beyond a configured threshold
- reject nodes with no meaningful path relation to the current learning frontier
- reject nodes already marked mastered
- avoid recommending the same node repeatedly unless the state has changed or the node is in explicit remediation mode

These guardrails prevent low-quality or confusing recommendations.

## Scoring Model

Eligible candidates are ranked using weighted scoring.

### Signals

- `readiness_score`
  Measures whether prerequisites are already mastered or at least explored.

- `weakness_score`
  Measures whether the student shows signs of weakness around the node or its prerequisite region.

- `importance_score`
  Measures how structurally important the node is in the graph, for example whether it unlocks many downstream nodes.

- `continuity_score`
  Measures how close the node is to the student’s current learning path and current node.

- `review_score`
  Measures whether the node should be revisited due to incomplete consolidation.

### MVP weights

- readiness: `0.35`
- weakness: `0.25`
- importance: `0.20`
- continuity: `0.20`

`review_score` should act as a mode-specific adjustment rather than part of the default advance formula.

### Mode resolution

- choose `remediate` when weakness and prerequisite repair dominate
- choose `review` when the strongest candidate is previously explored but insufficiently secure
- choose `advance` otherwise

## Reason Codes

The service should return structured reason codes instead of only natural language. Examples:

- `prerequisites_ready`
- `high_unlock_value`
- `close_to_current_path`
- `recent_quiz_weakness`
- `needs_review_before_advance`

These codes support explainable UI and allow future localization without coupling explanation logic to backend text.

## API Contract

Add a read-only route:

- `GET /api/v1/graph/recommendation/{course_id}?session_id=...`

### Response shape

```json
{
  "recommended_node_id": "topic_search",
  "mode": "advance",
  "score": 0.78,
  "reason_codes": [
    "prerequisites_ready",
    "high_unlock_value",
    "close_to_current_path"
  ],
  "backup_node_ids": [
    "concept_state_space",
    "topic_problem_formulation"
  ]
}
```

### Optional debug mode

In non-production or explicit debug mode, the response may include:

- candidate list
- per-signal scores
- rejected candidate reasons

This is useful for development and tuning but should not be required by the UI.

## Persistence Strategy

### MVP

Use existing state only:

- `current_node_id`
- `explored_nodes`
- `mastered_nodes`

If recent quiz outcomes are available from existing session or result history, they may be folded into weakness detection, but the MVP must not require new persistence tables.

### Phase 2 additions

Add lightweight per-node learning telemetry:

- `mastery_score`
- `last_interacted_at`
- `last_quiz_result`
- `failure_count`
- `review_due_at`

These should be treated as a later schema upgrade, not a blocker for MVP.

## UI Placement

### Graph canvas

- highlight the recommended node visually
- add a small badge such as `Next` or `Recommended`

### Node detail panel

- if the opened node is the recommended node, show that this is the suggested next step
- if a different node is opened, show whether the system recommends a different node first
- provide a `Go to recommended node` affordance

### Right pane

Show a small `Next recommended step` card above or near the study interaction area with:

- recommended node title
- short explanation
- button to open explanation flow
- button to start quiz on that node

This keeps recommendation visible without overwhelming the workspace.

## Refresh Triggers

Recompute recommendation after:

- course graph import completes
- a node is marked explored
- a node is marked mastered
- a quiz completes
- the student explicitly asks for the next step

The API can be called on demand in MVP. Real-time push is not required initially.

## UX Principles

- Do not force the recommendation. The student can still explore freely.
- Keep explanation short and actionable.
- Avoid recommendation loops where the same node is suggested repeatedly without new evidence.
- Preserve visual clarity. Recommendation should feel like guidance, not coercion.

## Rollout Plan

### MVP

- recommendation service
- recommendation API
- graph highlight
- node detail explanation

### Phase 2

- recommendation refresh after quiz grading
- remediation-aware explanation
- backup recommendation choices in UI

### Phase 3

- richer per-node mastery telemetry
- scheduled review support
- dynamic node integration

## Risks

### Weakness signal is too shallow

With only explored/mastered status, recommendations may still be somewhat coarse.

Mitigation:

- keep the scoring explainable
- expose debug data for tuning
- plan phase 2 telemetry early

### Graph structure quality varies by import quality

If imported prerequisites are weak, recommendation quality will be weak.

Mitigation:

- use conservative guardrails
- avoid overclaiming certainty in UI

### Recommendation loops

The system may keep suggesting the same node repeatedly.

Mitigation:

- track last recommendation
- suppress repeat recommendations unless state changed or the node remains critical due to remediation

## Success Criteria

The feature is considered successful if:

- students click or follow the recommended node at a meaningful rate
- recommended nodes convert into explored/mastered actions
- remediation recommendations correlate with improved quiz outcomes
- users do not get stuck in visible recommendation loops

## Final Recommendation

Implement `adaptive next-step recommendation` as a deterministic graph service for a single imported course, using guardrails plus score-based ranking. Keep the first version explainable, observable, and lightweight on persistence. Defer richer mastery modeling until the recommendation loop proves useful in real usage.
