# Adaptive Next-Step Tutor Design

## Goal

Add an in-session knowledge-personalization layer so DeepTutor can adjust the learner's next step immediately after meaningful interactions such as quiz outcomes, remediation results, retries, and hint usage.

The system should not only recommend a next node at the graph level. It should decide what the tutor should do next inside the active learning flow:

- advance to the next node
- stay on the current node and explain more
- give a short knowledge check
- route the learner into targeted remediation
- step back to the nearest prerequisite node when foundational weakness is detected

## Product Outcome

DeepTutor becomes an adaptive tutor during a live study session rather than only a graph-based navigator.

At the end of v1, the system should be able to:

- maintain a lightweight knowledge state for the active session
- update that state from deterministic learning signals
- choose the next learning action through a score-based policy
- explain why the action was chosen
- surface that explanation through existing graph recommendation and timeline UX

## Scope

### In scope

- per-session knowledge state for graph-linked learning flows
- deterministic signal extraction from quiz, remediation, retry, and hint interactions
- score-based policy for next-step decisions
- backend decision contract reusable by capabilities, routers, and UI
- explainability tags and summaries for each major decision
- focused UI surfacing of the current tutor decision in the graph and quiz flows

### Out of scope

- cross-session student modeling
- probabilistic knowledge tracing
- freeform LLM-only policy decisions
- cross-course planning
- instructor analytics or cohort dashboards
- automatic prerequisite jumps across multiple graph levels in one step

## Current Constraints

The current platform already has:

- a single-course Knowledge Graph with prerequisite structure
- graph recommendation logic
- node-linked quizzes
- remediation loop behavior
- learning timeline explainability
- a `course_assistant` capability that can shape the in-session flow

The current platform does not yet have:

- a dedicated in-session learner state model
- a reusable signal vocabulary for session learning events
- a deterministic policy layer between learning events and tutor actions
- a first-class contract for tutor next-step decisions

## Recommended Approach

Use a three-layer deterministic loop:

1. Extract normalized knowledge signals from learner actions.
2. Update a small session knowledge state for the active node and nearby prerequisites.
3. Run a score-based next-step policy that returns a single tutor decision with reason tags.

This is the recommended approach because it balances personalization, explainability, and implementation control.

## Why This Approach

Pure rule-based branching is easy to start but tends to become brittle when many interaction patterns are added.

Pure LLM judgment is flexible but too unstable and expensive for the core control loop of progression.

A score-based state engine provides a middle ground:

- deterministic behavior
- testable policy boundaries
- explainable state transitions
- room to evolve without replacing the architecture

## User Experience

### During a study session

After a meaningful interaction, the learner should see a clear next step instead of only a raw result.

Examples:

- after a clean quiz pass, the UI should suggest moving forward
- after repeated failure, the UI should recommend remediation instead of another blind retry
- after weak performance that suggests missing foundations, the UI should explain why a prerequisite review is recommended
- after recovery, the UI should explain that the learner is ready to continue

The system should feel like a tutor adjusting strategy in real time, not a static graph with occasional badges.

### Explanation behavior

Each tutor decision should have:

- a short learner-facing summary
- structured reason tags for UI rendering and timeline storage
- optional expert details for debug mode and future tuning

The learner-facing explanation should be concise and behavior-focused:

- what the system wants the learner to do next
- why that action is being recommended now

## Decision Model

The policy returns one of five actions:

- `advance`
- `stay_and_explain`
- `give_micro_quiz`
- `start_targeted_remediation`
- `fallback_to_prerequisite`

### Action semantics

`advance`

- learner appears ready to continue
- target is the next recommended graph node or the current flow's next study step

`stay_and_explain`

- learner is not failing badly, but the current node does not look secure enough to move on
- tutor should explain again or present a smaller clarification step

`give_micro_quiz`

- the system needs a fast check because the learner appears uncertain or only partially secure
- used to disambiguate whether to advance or remediate

`start_targeted_remediation`

- weakness is clear and the learner would benefit from a structured repair loop tied to the current node or a selected prerequisite

`fallback_to_prerequisite`

- the learner likely lacks a prerequisite concept strongly enough that continuing on the current node is not the best next move

## Session Knowledge State

The session model should stay lightweight and local to the current learning session.

### Top-level shape

`SessionKnowledgeState` should contain:

- `session_id`
- `course_id`
- `active_node_id`
- `nodes: dict[node_id, NodeKnowledgeState]`
- `last_policy_action`
- `last_policy_reason_tags`
- `last_updated_at`

### Per-node state

`NodeKnowledgeState` should contain:

- `mastery_score`
- `stuck_score`
- `prerequisite_risk`
- `confidence_score`
- `attempt_count`
- `hint_count`
- `last_outcome`
- `recent_signals`
- `last_interacted_at`

### Score intent

`mastery_score`

- estimates how secure the learner currently looks on the node
- should increase on successful recovery and reliable quiz performance
- should decrease on repeated failure or clear weakness

`stuck_score`

- estimates whether the learner is spinning on the same material without enough progress
- should rise on repeated retries, heavy hint usage, and repeated failure

`prerequisite_risk`

- estimates whether the learner's problem is foundational rather than local to the current node
- should increase when weak concepts map to prerequisite nodes or when remediation repeatedly fails

`confidence_score`

- estimates whether the learner appears stable enough to progress
- v1 may infer this indirectly from interaction patterns rather than explicit learner confidence input

## Knowledge Signals

All supported event sources should first be converted to a normalized signal vocabulary.

### Initial signal set

- `quiz_passed`
- `quiz_failed`
- `answer_correct`
- `answer_incorrect`
- `hint_requested`
- `retry_requested`
- `remediation_completed`
- `remediation_failed`
- `response_fast`
- `response_slow`

### Signal boundaries

Signals should be factual and local:

- what happened
- where it happened
- minimal metadata needed for state updates

Signals should not encode policy conclusions. For example, `needs_remediation` is not a signal. It is a policy outcome.

## State Update Engine

Create a deterministic state update service that consumes one normalized signal at a time and mutates the relevant node state.

### Update principles

- keep formulas simple and inspectable
- clamp scores to bounded ranges
- avoid hidden cross-node side effects except for explicit prerequisite-risk propagation
- store recent signals for explainability and debugging

### Recommended score ranges

- `mastery_score`: `-1.0` to `1.0`
- `stuck_score`: `0.0` to `1.0`
- `prerequisite_risk`: `0.0` to `1.0`
- `confidence_score`: `0.0` to `1.0`

### Example update behavior

- `quiz_passed` increases `mastery_score` and reduces `stuck_score`
- `quiz_failed` decreases `mastery_score` and increases `stuck_score`
- repeated `hint_requested` increases `stuck_score` and reduces `confidence_score`
- repeated `retry_requested` increases `stuck_score`
- `remediation_completed` increases `mastery_score` and lowers `prerequisite_risk`
- `remediation_failed` increases both `stuck_score` and `prerequisite_risk`

The exact coefficients should live in one config object so the policy can be tuned without rewriting decision code.

## Next-Step Policy

The next-step policy reads the current node state and limited graph context, then returns a single `NextStepDecision`.

### Decision contract

The response should include:

- `action`
- `target_node_id`
- `reason_tags`
- `explanation_summary`
- `recommended_difficulty`
- `should_record_timeline`

### Policy shape

The policy should remain deterministic and threshold-based in v1.

Recommended high-level behavior:

- choose `advance` when `mastery_score` is high and `stuck_score` is low
- choose `give_micro_quiz` when `mastery_score` is uncertain and confidence looks weak
- choose `stay_and_explain` when the learner is not blocked enough for remediation but not secure enough to progress
- choose `start_targeted_remediation` when repeated failure and high `stuck_score` indicate localized weakness
- choose `fallback_to_prerequisite` when `prerequisite_risk` crosses the configured threshold

### Movement guardrails

To preserve UX stability, v1 should only target:

- the current node
- the nearest relevant prerequisite node
- the graph recommendation service's best next node

The policy should not skip across multiple prerequisites or jump to distant graph regions.

## Reason Tags

Use structured reason tags instead of raw backend prose.

Recommended initial tags:

- `mastery_high`
- `mastery_uncertain`
- `recent_failure`
- `retry_loop_detected`
- `hint_dependence`
- `prerequisite_risk_high`
- `remediation_recovered`
- `ready_to_advance`

These tags support:

- student-facing summaries
- timeline explainability
- debug views
- localization

## Explainability

The next-step tutor must be explainable by design.

Each significant decision should emit:

- one concise learner-facing summary
- structured reason tags
- state snapshot fields needed for inspection in debug mode

Example summaries:

- `Bạn đã nắm khá chắc phần này, nên có thể chuyển sang bước tiếp theo.`
- `Bạn đang lặp lại cùng một lỗi, nên hệ thống đề xuất ôn đúng phần yếu trước khi làm tiếp.`
- `Hệ thống phát hiện bạn có thể đang thiếu nền tảng của node trước đó, nên tạm quay lại phần tiên quyết gần nhất.`

## Backend Architecture

Implement this feature as a graph-domain service layer reused by capabilities and API routers.

### New services

- `deeptutor/services/graph/session_knowledge_state.py`
- `deeptutor/services/graph/knowledge_signals.py`
- `deeptutor/services/graph/next_step_policy.py`

Responsibilities:

- define state models
- normalize incoming learning signals
- apply deterministic score updates
- produce next-step decisions

### Integration points

`deeptutor/capabilities/course_assistant.py`

- consume next-step decisions
- adjust tutor behavior within the live session
- switch between explanation, micro-quiz, remediation, and progression messaging

`deeptutor/capabilities/request_contracts.py`

- define serializable contracts for next-step decisions and optional state snapshots

`deeptutor/services/session/sqlite_store.py`

- optionally persist lightweight per-session state or at minimum persist decision events
- v1 may choose decision-event persistence first if full session-state persistence adds too much schema churn

`deeptutor/api/routers/`

- existing quiz, node-progress, remediation, and recommendation routes should emit normalized signals
- router code should not own personalization logic

## Recommendation and Graph Integration

This feature should complement existing recommendation logic rather than replace it.

Recommended interaction:

- graph recommendation still chooses the best next graph node
- next-step tutor decides whether the learner is ready to advance to that node now
- if not ready, the tutor can keep the learner on the current node or fallback to the nearest prerequisite

This separation keeps graph-level recommendation and in-session pedagogy distinct.

## Timeline Integration

Every meaningful next-step decision should be eligible for timeline recording.

Examples:

- `micro_quiz_recommended`
- `targeted_remediation_started`
- `prerequisite_fallback_recommended`
- `ready_to_advance_after_recovery`

Timeline entries should explain:

- what action was chosen
- which node it targeted
- the main reason tags behind the decision

## UI Placement

### Graph view

The graph workspace should show a focused `Current tutor recommendation` block that explains the next action for the active node.

This block should include:

- action label
- short explanation
- CTA matching the chosen action

### Quiz flow

After quiz completion, the result area should show the tutor decision instead of only pass/fail status.

Examples:

- `Tiếp tục sang node tiếp theo`
- `Làm một bài kiểm tra ngắn trước khi đi tiếp`
- `Ôn lại phần nền tảng đang yếu`

### Timeline drawer

The learning timeline should render these decisions as explainable milestones so the learner can inspect why the tutor changed course.

## Persistence Strategy

### V1

Prefer one of these two options:

1. persist only decision events and reconstruct short-lived state in memory for the active session
2. persist lightweight session knowledge state keyed by `session_id` and `course_id`

Recommendation:

Start with decision-event persistence plus lightweight session-state persistence only if the active web session architecture needs it for continuity across requests.

### Out-of-scope persistence

Do not treat v1 session knowledge state as durable long-term mastery history. That belongs to a future cross-session learner model.

## Testing Strategy

Use three layers of tests.

### Unit tests

Focus on state updates and policy decisions:

- repeated failure raises `stuck_score`
- remediation recovery lowers `prerequisite_risk`
- high mastery returns `advance`
- uncertain mastery returns `give_micro_quiz`
- high prerequisite risk returns `fallback_to_prerequisite`

### Integration tests

Test full signal-to-decision flows:

- fail -> hint -> retry -> remediation -> recovery
- pass quickly -> advance
- repeated remediation failure -> prerequisite fallback

### API and UI tests

Verify:

- decision contracts are exposed correctly
- timeline entries include reason tags and summaries
- graph and quiz UI render the chosen action and explanation

## Rollout Plan

### Phase 1

- add state models
- add signal vocabulary
- add score update engine
- add policy unit tests

### Phase 2

- integrate with quiz and remediation flows
- emit decision events and timeline explanations

### Phase 3

- integrate with `course_assistant`
- surface current tutor decision in graph and quiz UI

### Phase 4

- tune thresholds from observed behavior
- add optional debug output for policy inspection

## Risks

### Overreaction

If thresholds are too aggressive, the tutor may send learners into remediation too early.

Mitigation:

- keep thresholds conservative
- prefer `give_micro_quiz` before remediation when uncertainty is moderate

### Oscillation

The tutor may bounce between current-node help and prerequisite fallback.

Mitigation:

- add movement guardrails
- store the last action and avoid rapid reversals unless a strong new signal arrives

### Hidden logic

If decision explanations are weak, the system will feel arbitrary.

Mitigation:

- require reason tags and learner-facing summaries for all major decisions

## Success Criteria

The feature is successful for v1 when:

- the system can make deterministic next-step decisions during a live session
- those decisions react to actual learner performance signals
- the learner can see why a decision was made
- the implementation fits the existing graph, recommendation, remediation, and timeline architecture without replacing them
