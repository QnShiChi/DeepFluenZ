# Mastery Remediation Loop Design

## Goal

Add a student-facing remediation loop for graph-linked quizzes so that failing a node quiz no longer results in a dead end. Instead, the system should detect weakness, offer targeted remediation, verify recovery with a short remediation quiz, and only clear remediation state after the learner also passes the main node quiz again.

## Product Boundary

This feature applies only to quizzes that are linked to a Knowledge Graph node through `graph_context`.

In scope for v1:

- graph-linked node quizzes become `100% multiple choice`
- remediation mini-quizzes also become `100% multiple choice`
- question count becomes dynamic based on node difficulty and failure severity
- failing a node quiz creates remediation state in student graph progress
- learners see three choices after a failed node quiz:
  - `Ôn lại phần yếu`
  - `Làm lại quiz`
  - `Quay lại graph`
- choosing remediation generates or reuses a targeted remediation lesson in chat
- remediation may target the current node or the nearest prerequisite node
- remediation includes a short remediation mini-quiz
- the graph UI shows remediation state on affected nodes
- recommendation switches to `remediate` mode while remediation is active, but still keeps backup nodes

Out of scope for v1:

- non-graph quizzes
- freeform, coding, or essay grading for graph-linked quizzes
- hard-locking progression
- a dedicated remediation viewer outside chat
- full concept mastery scoring across the whole course
- remediation branches as first-class graph nodes

## User Experience

### Failed node quiz

When a learner fails a graph-linked node quiz, the result block should:

- clearly say the node is not yet passed
- explain that the system detected weak areas
- identify the remediation target as either:
  - the current node, or
  - a prerequisite node if foundational weakness is detected

The result block should present three actions:

- `Ôn lại phần yếu` as the primary CTA
- `Làm lại quiz`
- `Quay lại graph`

Choosing `Quay lại graph` closes the immediate flow but does not clear remediation state.

### Remediation lesson

When the learner chooses `Ôn lại phần yếu`, the system should:

1. look for a cached remediation artifact for the same remediation target and weak-concept snapshot
2. reuse it if available
3. otherwise generate a new remediation lesson in chat

The lesson should:

- stay grounded in the current course node context
- emphasize the weak concepts that caused the failure
- explain why this node is the remediation target
- be concise and structured for recovery, not a full re-teach of the course

### Remediation mini-quiz

After the remediation lesson, the learner should receive a short remediation mini-quiz focused on the weak concepts.

If the learner passes the remediation mini-quiz:

- remediation state moves to a checkpoint state indicating the learner is ready to retry the main node quiz
- the graph still shows remediation state until the main node quiz is passed

If the learner fails the remediation mini-quiz:

- remediation stays active
- attempt count increases
- the next remediation run may become slightly stronger or longer

### Graph and recommendation behavior

While remediation is active:

- the graph should visibly style remediation nodes differently from `explored` and `mastered`
- the remediation target should carry a strong visual signal such as badge + node style + explanatory copy
- the source failed node and remediation target may show different meanings:
  - source failed node: not yet passed
  - remediation target: recommended review target

The recommendation card should switch from normal next-step messaging to remediation messaging.

Recommendation behavior should be:

- primary recommendation: remediation target
- mode: `remediate`
- backup recommendations: nearby review or advance candidates

## Quiz Policy

### Question type

All graph-linked node quizzes and remediation mini-quizzes must be generated as multiple choice only.

This is required to keep grading deterministic and avoid the instability of freeform answer matching for graph progression.

### Main node quiz question count

Base count is determined by node difficulty:

- `easy`: 3 questions
- `medium`: 5 questions
- `hard`: 7 questions

Then adjust by failure severity:

- mild failure: `+0`
- moderate failure: `+1`
- severe failure: `+2`

This adjustment applies when the system generates a subsequent retry quiz for the same graph-linked node after a failure.

### Remediation mini-quiz question count

Remediation mini-quizzes should be shorter than the main node quiz:

- `easy`: 2 questions
- `medium`: 3 questions
- `hard`: 4 questions

If the learner has already failed remediation for the same active remediation state, add `+1` question on the next remediation mini-quiz attempt.

### Failure severity

Failure severity should be computed from:

- quiz score ratio
- mapped weak concepts or weak node links

Severity definitions:

- `mild`: learner is near threshold and misses a small number of concepts
- `moderate`: learner is clearly below threshold or shows concentrated weakness
- `severe`: learner scores low or reveals prerequisite weakness

Severity affects:

- retry node-quiz length
- remediation mini-quiz length
- remediation target resolution
- UI explanation copy

### Pass thresholds

Pass thresholds should be based on question count rather than a single floating threshold.

Recommended defaults:

- 3 questions: pass at 2 correct
- 5 questions: pass at 4 correct
- 7 questions: pass at 5 correct

For remediation mini-quizzes, the threshold should remain strict enough to confirm recovery, but should not require a perfect score by default.

## Remediation State Model

The student graph state should be extended with remediation metadata, persisted with course progress.

### Active remediation

Add an `active_remediation` object with:

- `source_node_id`
- `target_node_id`
- `weak_concepts`
- `failure_severity`
- `status`
- `attempt_count`
- `last_node_quiz_score`
- `last_remediation_quiz_score`

Recommended statuses:

- `recommended`
- `lesson_ready`
- `mini_quiz_ready`
- `passed_mini_quiz`
- `completed`

### Remediation cache

Add a remediation cache keyed by:

- `target_node_id`
- normalized weak-concept snapshot

Each cache entry should store:

- remediation lesson artifact metadata
- remediation mini-quiz artifact metadata
- creation timestamp

The cache lives with persistent course progress, not only the current chat session.

## Target Resolution

When a learner fails a node quiz, the system must decide what to remediate.

Default rule:

- target the current node

Override rule:

- if the failure data shows a clear prerequisite weakness, target the nearest unmet or most relevant prerequisite node instead

Weakness extraction should use a hybrid strategy:

1. prefer question-to-concept or question-to-node mapping when available
2. fall back to node-level weakness when fine-grained mapping is missing

The chosen target and weak concepts must be explainable in the UI.

## Recommendation Integration

The recommendation service should read active remediation state before normal ranking.

If remediation is active:

- return the remediation target as the primary recommendation
- use `mode = remediate`
- include `recent_quiz_weakness` in reason codes
- still compute backup node IDs for nearby valid alternatives

This integration should be implemented as a priority layer in front of the existing recommendation logic, not as a replacement for the full graph recommendation engine.

## State Clear Rules

Remediation state must not be cleared when the learner:

- closes the flow
- goes back to the graph
- simply reads the remediation lesson
- only passes the remediation mini-quiz

Remediation state is cleared only when both conditions are met:

1. the learner passes the remediation mini-quiz
2. the learner later passes the main node quiz

Passing the main node quiz through a later retry path still counts, as long as it is tied to the same unresolved remediation state.

## Backend Architecture

The feature should be implemented as four cooperating backend units:

- `graph_quiz_policy`
  - decides question type, question count, pass threshold, and failure severity
- `remediation_state_manager`
  - creates, updates, advances, and clears remediation state in student graph progress
- `remediation_artifact_service`
  - reuses or generates remediation lesson and remediation mini-quiz artifacts
- `recommendation_integration`
  - prioritizes remediation in graph recommendation responses

These units should remain deterministic where possible. Content generation may be used for the remediation lesson and remediation quiz artifacts, but progression state changes and pass/fail handling should remain rule-based and explainable.

## Frontend Architecture

The remediation loop should touch three main surfaces:

- quiz result UI
- chat flow
- graph/recommendation UI

### Quiz result UI

The quiz result area should:

- render the fail state clearly
- present the three CTA choices
- surface the remediation target explanation

### Chat flow

The chat flow should:

- render the remediation lesson as a structured assistant response
- preserve enough metadata to identify the active remediation artifact
- trigger remediation mini-quiz generation after the lesson

### Graph UI

The graph should:

- display remediation styling and badges
- explain remediation state in node detail
- update recommendation card copy for remediation mode

## Testing Strategy

### Unit tests

- quiz policy:
  - difficulty-to-question-count mapping
  - severity adjustments
  - pass thresholds
  - multiple-choice enforcement for graph-linked quizzes
- remediation state manager:
  - create state on node-quiz failure
  - pass remediation mini-quiz without fully clearing state
  - clear only after passing the main node quiz
- target resolution:
  - current-node remediation
  - prerequisite-target remediation
  - weak concept mapping with fallback

### Integration tests

- quiz result persistence creates remediation state
- remediation lesson requests hit cache or generate new artifacts correctly
- remediation mini-quiz follows policy
- recommendation API switches to remediation mode

### UI tests

- failed quiz shows all three CTAs
- `Ôn lại phần yếu` starts the remediation flow
- graph styling reflects remediation state
- recommendation card switches to remediation copy
- remediation badge clears only after pass-mini-quiz plus pass-main-quiz

## Rollout Plan

Ship in three phases:

### Phase 1

- graph-linked quizzes become multiple choice only
- dynamic question-count policy
- failed-quiz CTA block

### Phase 2

- remediation state persistence
- chat-based remediation lesson
- graph remediation styling

### Phase 3

- remediation mini-quiz
- remediation cache
- recommendation remediation mode

## Risks and Guardrails

### Weak concept extraction quality

Risk:

- concept targeting may be noisy when quiz metadata is sparse

Mitigation:

- use hybrid mapping with node-level fallback

### Quiz inflation

Risk:

- adaptive question counts may make retries too long

Mitigation:

- keep explicit caps by difficulty tier

### State confusion

Risk:

- learners may not understand whether they are in normal node progression or remediation

Mitigation:

- use clear remediation-specific copy in quiz results, graph badges, and recommendation cards

### Artifact sprawl

Risk:

- too many nearly identical remediation lessons and mini-quizzes

Mitigation:

- cache by remediation target plus weak-concept snapshot

## Recommendation

The next feature should be a focused `Mastery Remediation Loop` for graph-linked quizzes, not a full mastery platform.

This scope is the right next step because it:

- directly improves student learning behavior after quiz failure
- builds on the current graph state, quiz result persistence, and recommendation system
- removes unstable mixed quiz formats from graph progression
- stays explainable and testable

It should be implemented as a student-facing loop that uses:

- multiple-choice-only graph quizzes
- difficulty and failure-aware question counts
- persistent remediation state
- chat-based remediation delivery
- graph and recommendation awareness of remediation progress
