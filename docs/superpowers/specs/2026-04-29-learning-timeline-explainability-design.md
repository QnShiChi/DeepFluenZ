# Learning Timeline + Explainability Design

## Goal

Add a student-facing learning timeline to the Knowledge Graph experience so learners can understand:

- what happened in their course progress
- why the system changed recommendation direction
- why remediation was triggered
- what the next meaningful action should be

The feature should make the system feel interpretable without turning the graph screen into a technical debug console.

## Product Boundary

This feature lives inside the Knowledge Graph screen and focuses on course-long learning progress, not only the current chat session.

In scope for v1:

- a collapsible `Learning Timeline` drawer on the graph screen
- timeline data persisted across long-term course progress
- timeline events for:
  - node progress milestones
  - quiz outcomes
  - remediation milestones
  - recommendation decision changes
- dual-layer explainability:
  - short student-facing summaries
  - expandable expert/debug details
- filter chips for:
  - `All`
  - `Node`
  - `Quiz`
  - `Remediation`
  - `Recommendation`
- light actions from timeline events, such as:
  - focus node
  - open node detail
  - retry quiz
  - start remediation
  - jump to recommended node
- entry points into the timeline from recommendation UI, node detail UI, and remediation-related chat milestones

Out of scope for v1:

- a separate progress screen outside the graph page
- full analytics dashboards
- logging low-level interaction telemetry such as clickstream events
- lock/unlock transition history
- user-pinned custom milestones
- editing graph state directly from the timeline

## User Experience

### Placement and visibility

The timeline should appear directly inside the Knowledge Graph screen as its own drawer.

It should:

- be collapsed by default
- open on demand without covering too much of the graph
- stay available as a persistent companion for explainability

The goal is similar to `Graph Health` in placement convenience, but the audience is different:

- `Graph Health` explains course-graph quality for authoring
- `Learning Timeline` explains student learning progress and system decisions

### Entry points

The timeline should have a primary home in the graph screen, but it should also be reachable from multiple relevant surfaces:

- the drawer handle itself
- recommendation card links such as “why this step?”
- node detail panel links such as “view learning history”
- remediation-related chat milestones

These entry points should be able to open the drawer already focused on a relevant node or event context.

### Timeline list

The main drawer content should present a time-ordered stream of important learning events.

The default experience should:

- group events by day
- show relative timestamps on each item
- show highlighted milestones more prominently
- let the learner quickly scan the story of their progress

Each event card should contain:

- category icon or label
- short summary
- timestamp
- reason tags when relevant
- one or more light actions when useful
- expandable detail for expert view

### Student and expert views

The timeline should support two layers of explainability through one event card model.

The default collapsed state should be written for learners:

- short
- natural
- outcome-oriented

The expanded detail should expose structured expert/debug information such as:

- event type
- source node
- target node
- recommendation mode
- reason codes
- score ratio
- remediation status

This keeps the main UI approachable while still making the system debuggable for advanced users, instructors, and internal testing.

### Actions

The timeline is not a separate control center. It can trigger only lightweight actions that jump into existing flows.

Allowed actions in v1:

- `View node`
- `Open node detail`
- `Retry quiz`
- `Review weak area`
- `Go to recommended step`

These actions should reuse existing graph, quiz, and remediation flows rather than adding new domain logic inside the timeline itself.

### Chat integration

Chat should not render the whole timeline. It should only surface important milestones, such as:

- node quiz failed
- remediation recommended
- remediation started
- remediation mini-quiz passed
- node quiz passed after remediation
- recommendation changed in a meaningful way

These milestone messages may include a button or link to open the timeline focused on the relevant event or node.

## Event Model

The timeline should use a single event schema that can serve both student view and expert/detail view.

Each event should contain:

- `event_id`
- `session_id`
- `course_id`
- `node_id` when applicable
- `category`
- `event_type`
- `created_at`
- `summary`
- `reason_tags`
- `details`
- `actions`
- `highlighted`

### Categories

The event categories for v1 are:

- `node`
- `quiz`
- `remediation`
- `recommendation`

### Event types

The event taxonomy for v1 should be intentionally narrow and meaningful:

- `node_started`
- `node_mastered`
- `quiz_failed`
- `quiz_passed`
- `remediation_recommended`
- `remediation_started`
- `remediation_mini_quiz_passed`
- `remediation_completed`
- `recommendation_changed`

Events such as raw node clicks, panel opens, and drawer interactions should not be logged in the timeline.

### Reason tags

Reason tags should be deterministic, compact, and reusable across event types.

Recommended v1 tags:

- `prerequisite_ready`
- `recent_weakness`
- `retry_passed`
- `remediation_active`
- `remediation_cleared`
- `advanced_to_next`
- `manual_retry`

The UI should show tags as short chips. The system should not generate them as freeform text.

## Explainability Payload

Every event should support two explanation layers.

### Student summary

The summary should answer the question:

> “What happened, in plain language, and why should I care?”

Examples:

- “Bạn chưa vượt qua quiz của node này, nên hệ thống đề xuất ôn lại phần nền tảng.”
- “Bạn đã hoàn thành bước ôn lại và sẵn sàng kiểm tra lại node chính.”
- “Hệ thống đổi bước tiếp theo vì bạn vừa hoàn thành phần kiến thức tiên quyết.”

### Expert details

The detail block should answer:

> “Which rule or state transition caused this event?”

Examples of fields that may appear:

- `event_type`
- `reason_codes`
- `recommendation_mode`
- `recommended_node_id`
- `backup_node_ids`
- `source_node_id`
- `target_node_id`
- `score_ratio`
- `failure_severity`
- `active_remediation_status`

The details payload should be structured data derived from existing state and rules, not a second narrative generated independently.

## Timeline Scope and Persistence

The timeline should represent course-long progress, not just the current chat session.

That means:

- the learner can leave and return later without losing timeline history
- the timeline can explain current state using events from previous sessions
- recommendation and remediation decisions remain interpretable across time

The timeline should still retain `session_id` for traceability, but the primary reading model is course progress over time.

## Backend Architecture

This feature should be implemented as a projection layer over existing graph and remediation state transitions, not as a new source of truth.

### Source of truth

The underlying truth remains:

- student graph progress state
- graph-linked quiz results
- remediation state
- recommendation transitions

The timeline event stream is a readable historical projection of those transitions.

### Persistence model

Store timeline data in a dedicated lightweight event store rather than embedding history inside student graph state JSON.

Each persisted event record should include:

- `event_id`
- `session_id`
- `course_id`
- `node_id`
- `category`
- `event_type`
- `summary`
- `reason_tags_json`
- `details_json`
- `actions_json`
- `highlighted`
- `created_at`

This keeps the current student-state document focused on current state, while the timeline store handles history queries efficiently.

### Event creation points

Events should be emitted only at meaningful state transitions:

- when a node is entered or marked in progress
- when a graph-linked node quiz is passed or failed
- when remediation is recommended
- when remediation is started
- when remediation mini-quiz is passed
- when remediation is completed
- when recommendation mode or target changes meaningfully

Meaningful recommendation change means at least one of these changed:

- target node
- recommendation mode
- primary reason codes

This prevents timeline spam.

## API Shape

The minimum API surface for v1 should be read-oriented:

- `GET /api/v1/graph/timeline/{course_id}`

Supported query parameters:

- `category`
- `node_id`
- `limit`
- optional cursor or pagination token if needed for longer histories

The API should return events in reverse chronological order, grouped on the frontend by day.

No standalone mutation API is required for timeline events in v1 because events are created from existing state transitions.

## Frontend Architecture

The frontend should be split into three focused pieces:

### Timeline data layer

Create a small timeline API module responsible for:

- fetching timeline data
- passing category and node filters
- returning typed event records

### Timeline formatting layer

Create a UI formatter module responsible for:

- category labels
- icons
- reason tag labels
- summary helpers
- action labels
- expert detail formatting

### Drawer component

Create a dedicated `LearningTimelineDrawer` component responsible for:

- open/close behavior
- filter chips
- grouped event list
- detail expansion
- action callbacks

`KnowledgeGraphViewer` should remain the coordinator that:

- mounts the drawer
- passes selected node or current context
- handles callbacks such as focus node, retry quiz, or start remediation

## Recommendation Integration

Timeline explainability depends heavily on recommendation integration.

When recommendation changes meaningfully, the system should create a `recommendation_changed` event that records:

- the new target node
- the new recommendation mode
- a small set of reason tags
- structured expert details derived from the recommendation payload

This event should explain shifts such as:

- normal next-step progression
- remediation override
- advancement after mastery

The timeline should not recompute recommendation reasoning client-side.

## Error Handling and Guardrails

The timeline must degrade gracefully when some details are missing.

Examples:

- if `node_id` is missing, render a generic event card without focus action
- if expert detail fields are unavailable, keep the summary and tags
- if recommendation details are partial, still render the event with a reduced detail view

The timeline must never block the core graph flow if the event store or timeline API has partial issues.

## Testing Strategy

The feature should be tested at four layers.

### Event creation tests

Verify that meaningful transitions generate the correct event types and payloads.

Examples:

- node quiz fail creates `quiz_failed`
- remediation creation creates `remediation_recommended`
- passing remediation mini-quiz creates `remediation_mini_quiz_passed`
- recommendation change creates `recommendation_changed`

### Store and API tests

Verify:

- events persist correctly
- ordering is correct
- category filters work
- node filters work
- course-long history survives refresh and later sessions

### UI tests

Verify:

- drawer is collapsed by default
- opening the drawer shows grouped events
- filter chips work
- expert detail expansion works
- timeline actions trigger the correct callbacks

### Integration tests

Verify the end-to-end learning flow:

- fail quiz -> remediation recommendation -> recommendation change
- pass remediation mini-quiz -> event emitted
- pass node quiz after remediation -> remediation completion event emitted

## Rollout Plan

Rollout should happen in three phases:

1. backend event model, persistence, and read API
2. read-only timeline drawer with filters and expert details
3. action hooks and deep links from recommendation, node detail, and chat milestones

This sequencing keeps the projection model testable before coupling it to more UI actions.

## Open Design Principles

The feature should preserve these boundaries:

- timeline explains existing flows, it does not become a second graph engine
- timeline uses deterministic event creation from state transitions
- timeline prioritizes readability over exhaustiveness
- expert detail exists to debug and build trust, not to dominate the main learner experience

## Success Criteria

This feature is successful when:

- a learner can open the drawer and understand the recent story of their course progress
- the learner can tell why remediation or a recommendation happened
- the learner can jump from explanation to the next relevant action with one click
- the graph screen becomes more interpretable without becoming more cluttered
