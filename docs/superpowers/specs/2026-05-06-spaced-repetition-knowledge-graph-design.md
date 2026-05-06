# Spaced Repetition on Knowledge Graph Design

## Goal

Add a review scheduling layer on top of the Knowledge Graph so DeepTutor can recommend what the learner should revisit, when they should revisit it, and why that review matters for future progress.

The system should not treat review as a separate flashcard product. It should make review a first-class part of graph-based learning:

- surface review-worthy nodes inside the course graph
- schedule review from quiz and learning activity signals
- prioritize review by forgetting risk and graph importance
- explain why a node is being recommended for revisit
- return the learner to normal progression as soon as review is sufficient

## Product Outcome

DeepTutor becomes capable of protecting knowledge over time rather than only reacting to immediate failure.

At the end of the first full rollout, the system should be able to:

- maintain review state for graph-linked learning
- estimate whether a concept or node is due for review
- rank review recommendations with a risk-first strategy
- surface review as a recommendation mode alongside advance and remediate
- explain review recommendations through graph UI and timeline events

## Scope

### In scope

- review scheduling for graph-linked course learning
- hybrid state model: concept-level engine with node-level UI summaries
- deterministic signal ingestion from quiz and learning activity
- risk-first review prioritization that considers graph topology
- recommendation mode `review`
- graph, timeline, and queue surfaces for review recommendations
- fallback behavior when concept mapping is incomplete

### Out of scope

- standalone flashcard authoring
- cross-course review planning
- probabilistic knowledge tracing or BKT/IRT modeling
- freeform LLM-only scheduling decisions
- instructor dashboards or cohort analytics
- mobile push notifications or email reminder systems

## Current Constraints

The current platform already has:

- a course Knowledge Graph with prerequisite links
- graph recommendation logic with `advance` and `remediate` behavior
- session knowledge state and next-step tutoring direction
- node-linked quiz and remediation flows
- a learning timeline that can explain graph-level decisions

The current platform does not yet have:

- a dedicated review state model for memory over time
- a signal vocabulary for review scheduling
- a first-class `review` recommendation mode
- a review queue or review-specific learner workflow
- concept-level review storage behind the graph UI

## Recommended Approach

Use a hybrid review engine:

1. Track review state at the `concept` level when enough mapping exists.
2. Aggregate that state into node-level summaries for graph recommendations and UI.
3. Rank review recommendations with a risk-first policy instead of pure due-date ordering.

This is the recommended approach because it keeps the learner experience simple while preserving a path to more precise scheduling over time.

## Why This Approach

Pure node-level scheduling ships quickly, but it loses precision whenever a node contains several distinct skills.

Pure concept-level UX is more precise but would make the graph feel too granular and harder to navigate.

A hybrid model keeps the external product language stable:

- the learner still reviews a node
- the scheduler can still reason about smaller concept units
- the system can fall back gracefully when concept mapping is weak

## Product Principles

- Review should feel like support, not punishment.
- Quiz evidence is stronger than passive activity evidence.
- Recommendations must stay explainable.
- The system should prefer small, timely review loops over heavy review sessions.
- Graph topology should matter. Forgetting a concept that blocks future nodes is more important than forgetting an isolated one.

## User Experience

### Learner-facing behavior

The learner should see three kinds of guidance in the graph experience:

- what to learn next
- what to remediate now
- what to review before knowledge decays or blocks future progress

Review should feel lightweight. The default message should suggest a short revisit that helps the learner maintain momentum.

### Recommendation behavior

The recommendation system should support three top-level modes:

- `advance`
- `remediate`
- `review`

`review` means the learner is not necessarily failing, but the system believes revisiting a node now will reduce future failure risk or unblock the path ahead.

### Explanation behavior

Every review recommendation should have:

- a short learner-facing summary
- structured reason codes for UI and timeline
- optional debug details for tuning and inspection

Typical learner-facing explanation patterns:

- this topic is becoming easy to forget
- this prerequisite matters for what you are about to learn next
- your recent quiz performance suggests a short review will help

## Architecture

The feature should be implemented as four cooperating units:

- `Review State Engine`
- `Signal Ingestion Layer`
- `Review Recommendation Layer`
- `Review UI Surfaces`

### Review State Engine

Owns concept-level review state and node-level summary state.

Responsibilities:

- update review state from normalized signals
- apply time-based decay
- compute due-ness and forgetting risk
- aggregate concept state into node-level review summaries

### Signal Ingestion Layer

Normalizes quiz and learning activity into deterministic review signals.

Responsibilities:

- accept events from quiz, graph, tutor, and remediation flows
- convert those events into a review signal vocabulary
- attach enough metadata for localized state updates

### Review Recommendation Layer

Ranks review targets and chooses when review should be surfaced as the active recommendation.

Responsibilities:

- score node summaries with a risk-first policy
- compare review targets against advance and remediation opportunities
- return explanation metadata for UI and timeline consumers

### Review UI Surfaces

Makes review visible and actionable without requiring a separate mental model.

Responsibilities:

- show review state on graph nodes
- show review-aware recommendation copy
- provide a queue or drawer for grouped review tasks
- show review events in the learning timeline

## Review State Model

The model has two layers: concept state for decision quality and node summary state for product surfaces.

### Concept Review State

`ConceptReviewState` should contain:

- `concept_id`
- `node_id`
- `last_reviewed_at`
- `due_at`
- `stability`
- `difficulty`
- `retrievability`
- `forgetting_risk`
- `evidence_count`
- `last_outcome`
- `last_signal_at`

### Field intent

`stability`

- how durable the memory currently appears
- should rise after reliable retrieval success
- should fall after failure or repeated struggle

`difficulty`

- how hard the concept appears for this learner
- should rise on repeated failure
- should fall slowly after repeated strong recovery

`retrievability`

- how likely the learner seems able to recall the concept now
- should decay with time
- should increase on active successful retrieval

`forgetting_risk`

- how urgent the concept is for review
- derived from memory state and time since last meaningful retrieval

### Node Review Summary

`NodeReviewSummary` should contain:

- `node_id`
- `node_due_at`
- `max_risk`
- `avg_retrievability`
- `blocking_weight`
- `weak_concepts_count`
- `recommended_review_mode`
- `last_review_recommended_at`

### Review modes

`recommended_review_mode` should support:

- `focused_review`
- `full_node_review`
- `light_recall_check`

Use:

- `focused_review` when one or two concepts dominate the risk
- `full_node_review` when weakness is broad across the node
- `light_recall_check` when the learner appears mostly secure but due for reinforcement

## Signal Vocabulary

Signals should remain factual and local. They should describe what happened, not what policy should decide.

### Strong signals

- `quiz_passed`
- `quiz_failed`
- `answer_correct`
- `answer_incorrect`
- `remediation_completed`
- `remediation_failed`

### Supporting signals

- `node_viewed`
- `explanation_viewed`
- `tutor_asked`
- `hint_requested`
- `retry_requested`

### Signal weighting principle

Quiz and retrieval evidence should be stronger than passive activity.

The system may use learning activity to soften decay or improve familiarity, but passive behavior alone should not create a strong mastery illusion.

## State Update Rules

Create a deterministic update service that consumes one normalized signal at a time.

### Update principles

- keep formulas inspectable and bounded
- separate evidence strength by signal type
- decay over time instead of only reacting to discrete events
- allow explicit fallback to node-level state when concept granularity is missing

### Example update behavior

- `quiz_passed` increases `stability` and `retrievability`
- `quiz_failed` reduces `retrievability`, increases `difficulty`, and shortens the next interval
- repeated `answer_incorrect` increases `forgetting_risk`
- `remediation_completed` improves `stability` but does not imply perfect recovery
- `node_viewed` or `explanation_viewed` can provide a small familiarity boost only
- `tutor_asked` may raise evidence count but should not look equivalent to successful recall

### Time decay

`retrievability` should decay over time based on the current concept state. `due_at` represents the point where the concept is predicted to enter the review-worthy risk zone.

## Review Prioritization

The system should not rank only by earliest `due_at`.

Instead, each node should receive a composite review priority derived from:

- forgetting risk
- graph blocking weight
- recent failure weight
- recent success buffer

### Priority intuition

- if a concept is likely to be forgotten soon, it should rise in priority
- if that concept blocks important downstream nodes, it should rise further
- if the learner recently failed on it, the recommendation should become more urgent
- if the learner just reviewed it successfully, urgency should temporarily drop

### Risk-first policy

When time is limited, the recommendation layer should prefer the node whose weakness is most likely to damage future learning, not merely the one that is oldest by date.

## Graph Weighting

Graph structure should affect review ranking.

`blocking_weight` should increase when:

- the node is a prerequisite for many future nodes
- the node is close to the learner's active path
- the node has already contributed to recent remediation or quiz failures downstream

This weighting should be additive and explainable, not a hidden override.

## Fallback Rules

The system must remain useful even when fine-grained concept mapping is incomplete.

### Required fallbacks

- if concept mapping is unavailable, schedule review at the node level
- if signals conflict and confidence is low, soften the learner-facing wording
- if a node is both a likely advance target and a likely review target, surface both signals with explanation rather than hiding one silently

## User Flow

Recommended default flow:

1. learner opens the course graph
2. system shows both forward progress and review opportunities
3. if a high-risk prerequisite is due, the review recommendation can take priority
4. learner enters a short review loop
5. review outcome updates review state immediately
6. recommendation recalculates and either returns the learner to `advance` or routes into `remediate`

The experience should feel like keeping the learner ready, not pulling them off track.

## UI Surfaces

### Knowledge Graph

Nodes should support review-specific states such as:

- `review_due`
- `at_risk`
- `recommended_revisit`

These states should be visually distinct from `explored`, `mastered`, and `remediate`.

### Recommendation Card

The existing recommendation surface should gain `review` copy and CTA behavior.

Example outcomes:

- review before advancing
- short recall check recommended
- revisit this prerequisite first

### Review Queue

Add a learner-facing queue or drawer grouping review work into practical buckets such as:

- urgent review
- quick 5-minute review
- review to unlock next progress

### Learning Timeline

The timeline should record events such as:

- `review_scheduled`
- `review_recommended`
- `review_completed`
- `review_failed`
- `risk_increased`

This allows the system to explain why a review recommendation appeared and how it changed over time.

## Rollout Plan

### Phase 1

Add node-level review recommendation and UI support using current graph state infrastructure.

Goal:

- prove that learners engage with review recommendations
- establish `review` as a valid recommendation mode

### Phase 2

Introduce concept-level state behind the scenes while keeping UI language at the node level.

Goal:

- improve precision without increasing UX complexity

### Phase 3

Introduce stronger graph risk weighting from prerequisite topology and downstream failure history.

Goal:

- make review ranking more adaptive to the learner's real path through the course

## Error Handling

- if concept state is partial, prefer graceful node-level review over silent omission
- if activity-derived evidence is noisy, prefer quiz evidence
- if the scheduler is uncertain, use softer learner copy rather than hard commands
- if recalculation fails, keep the previous recommendation until the next valid update rather than clearing the UI abruptly

## Testing Strategy

### Engine tests

- state update rules
- decay behavior
- due calculation
- priority scoring
- concept-to-node aggregation
- fallback behavior

### Integration tests

- quiz events update review state correctly
- activity events do not overpower retrieval evidence
- recommendation transitions among `advance`, `review`, and `remediate`
- timeline events are emitted with the right reason metadata

### UI tests

- graph node review states render correctly
- recommendation copy changes with `review` mode
- queue ordering matches priority logic
- timeline labels match review event types

## Success Metrics

- rate of accepted review recommendations
- rate of successful return to forward progress after review
- reduction in repeated prerequisite failures
- improvement on re-check quizzes after scheduled review
- number of consecutively ignored review recommendations

## Open Product Decision Resolved

This design intentionally chooses:

- hybrid engine: concept-level internals with node-level UI
- signal set: quiz plus learning activity, with quiz as the stronger source of truth
- prioritization strategy: risk-first rather than due-first

These decisions keep the first implementation aligned with the current graph-centric product while leaving room for more advanced review intelligence later.
