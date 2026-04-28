# Graph QA and Prerequisite Authoring Design

## Goal

Add a graph quality assurance and prerequisite authoring layer on top of the existing course Knowledge Graph so instructors can detect prerequisite problems, apply safe fixes, and control whether adaptive learning features are allowed to rely on the graph.

This feature is explicitly scoped to one course graph at a time. It is not a full graph governance system, not a versioned publishing workflow, and not a general-purpose visual graph editor.

## Product Outcome

The course graph stops being a passive imported structure and becomes a maintained instructional artifact that can:

- detect prerequisite and path-quality problems before they affect students
- explain why the graph is unsafe or incomplete for adaptive learning
- suggest safe edge-level fixes
- let instructors repair prerequisite semantics in context
- gate adaptive recommendation features when the graph is critically broken

## Scope

### In scope

- Rule-based graph QA analysis for one course
- Health summary and issue severity classification
- Suggested fixes for edge semantics only
- Graph Health instructor view
- Inline issue highlighting inside the Knowledge Graph
- Single-fix apply
- Bulk safe-fix apply through a draft change set
- Hybrid publish gate for adaptive features
- Deterministic API responses for QA, fixes, draft state, and gate state

### Out of scope

- Full graph versioning
- Full freeform graph editing
- Automatic node regrouping or backbone reordering
- Student-behavior-driven QA heuristics
- LLM-based issue detection or auto-fix planning
- Multi-course dependency quality analysis

## Why This Feature Is Next

The adaptive recommendation system now depends heavily on graph semantics being correct. If prerequisite edges are missing, mislabeled, or structurally broken, the recommendation engine can only make confidently wrong decisions.

This feature addresses the root cause instead of repeatedly compensating in the recommendation layer or UI.

## Primary Users

### Instructor or admin

Primary user for QA review, edge repair, and adaptive-readiness management.

### Student

Read-only consumer of the resulting adaptive state. Students should not edit the graph, but they may see course-level readiness status such as:

- `Adaptive Ready`
- `Adaptive Limited`
- `Adaptive Blocked`

## Recommended Approach

Use a deterministic graph QA engine plus a focused prerequisite authoring workflow.

The QA engine analyzes the graph and emits explainable issues and fix suggestions. The authoring workflow lets instructors apply single edge-level fixes immediately or stage multiple safe changes in a draft set before committing them.

Adaptive features should not independently guess graph quality. They should read the QA gate state and behave accordingly.

## Publish Gate Model

Use a hybrid gate:

- the course graph itself can still exist and be viewed
- adaptive features depend on QA gate status

### Gate behavior

- `Adaptive Ready`
  No blocking graph issues. Recommendation and locked progression can run normally.

- `Adaptive Limited`
  No critical blockers, but the graph still has non-critical quality issues. Recommendation may run with warning affordances.

- `Adaptive Blocked`
  The graph contains critical prerequisite or path issues. Adaptive recommendation, next-step guidance, and locked progression should be disabled or downgraded to safe fallback behavior.

### Blocking rule for MVP

Only `critical` issues block adaptive mode in v1.

This keeps the system explainable and avoids over-blocking on heuristics that may be directionally right but not certain enough to stop instructors.

## QA Signal Model

The QA engine should use:

- graph structure
- node metadata

It should not use live student quiz or progression behavior in v1.

### Metadata examples

- node title
- node type
- module or chapter grouping
- explicit difficulty if present
- imported ordering metadata if available

## QA Output Model

Each QA run should produce four top-level result groups:

### `health_summary`

Contains:

- `score`
- `adaptive_ready`
- `critical_count`
- `high_count`
- `medium_count`
- `low_count`

### `issues`

Each issue should contain:

- `issue_id`
- `severity`
- `kind`
- `message`
- `affected_node_ids`
- `affected_edge_ids`
- `why_it_matters`

### `suggested_fixes`

Each fix should contain:

- `fix_id`
- `issue_id`
- `confidence`
- `change_type`
- `preview`
- `safe_for_bulk_apply`

### `gate_status`

Contains:

- `status`
- `blocking_issue_ids`
- `student_visible_message`
- `instructor_message`

## Issue Taxonomy for MVP

The issue set should stay small and directly tied to adaptive-learning reliability.

### Critical

- `prerequisite_cycle`
  Example: `A -> B -> C -> A`

- `backbone_path_broken`
  The graph cannot form a valid learning path across core nodes.

- `unreachable_core_node`
  A core node cannot be unlocked through any valid prerequisite path.

### High

- `suspect_part_of_should_be_prerequisite`
  An edge currently labeled `part_of` appears to represent dependency rather than grouping.

- `missing_prerequisite_edge`
  A node appears advanced or downstream but lacks a plausible prerequisite edge.

### Medium

- `redundant_prerequisite_edge`
  A prerequisite edge appears unnecessary because the dependency is already implied by other edges.

- `orphan_node`
  A node is not meaningfully connected to the main learning path.

### Low

- `inconsistent_module_flow`
  Module ordering and graph dependency signals look slightly inconsistent but not clearly broken.

## Fix Model for MVP

Suggested fixes in v1 are limited to edge semantics:

- change `relation_type` from `part_of` to `prerequisite`
- change `relation_type` from `prerequisite` to `part_of`
- add a missing prerequisite edge
- remove a redundant prerequisite edge

No automatic node regrouping, reordering, or backbone reconstruction is included in v1.

## Safety Model

### Single fix

An instructor may apply one fix immediately when:

- the fix is explicit
- the impact is local
- the fix preview is clear

### Bulk fixes

Bulk apply is allowed only for fixes marked `safe_for_bulk_apply = true`.

Bulk fixes must go through a draft change set. They should not mutate the graph immediately.

## Draft Change Set Model

The draft change set is a lightweight staging area for multiple safe fixes.

It should support:

- listing staged changes
- removing a staged change
- committing all staged changes
- re-running QA after commit

This is not a full version-control system. It is a review buffer for bulk semantic edge edits.

## User Experience

### Graph Health tab

This is the instructor’s overview surface.

It should show:

- health score
- adaptive status banner
- issue counts by severity
- grouped issue list
- suggested fixes
- `Analyze Graph` action
- `Apply safe fixes` action
- draft change set summary

### Inline graph feedback

The Knowledge Graph should also surface issues in context.

Examples:

- node outline or badge by severity
- suspicious edge styling for problematic prerequisite relations
- click-from-panel to focus node or edge
- side panel content showing issue explanation and available actions

### Focused authoring

v1 should allow only targeted prerequisite editing:

- change edge relation between `part_of` and `prerequisite`
- add prerequisite edge
- remove prerequisite edge
- apply a suggested fix

It should not become a freeform graph editor in this phase.

## Workflow

### Automatic analysis

QA should run automatically after:

- course graph import
- graph save
- fix apply
- draft commit

### Manual analysis

Instructors should still have an explicit `Analyze Graph` action to recompute QA on demand.

### Typical instructor loop

1. Import or open a course graph.
2. QA runs and produces health status.
3. Instructor opens `Graph Health`.
4. Instructor reviews critical and high issues.
5. Instructor clicks an issue and the graph focuses the relevant node or edge.
6. Instructor applies a single fix or stages multiple safe fixes.
7. QA re-runs and updates score and gate state.
8. Adaptive mode becomes available once critical issues are resolved.

## Backend Architecture

Split responsibilities into four services:

### `graph_qa_analyzer`

Loads the graph and emits:

- health summary
- issues
- gate status

### `graph_fix_planner`

Turns issues into fix suggestions with:

- previews
- confidence
- bulk-safety metadata

### `graph_authoring_service`

Applies single fixes and commits draft change sets into the course graph.

### `adaptive_gate_resolver`

Computes course-level adaptive state from the latest QA result for use by recommendation and UI layers.

## Persistence Strategy

v1 should store course-level state only.

### Persisted QA report

- `course_id`
- `score`
- `adaptive_ready`
- `gate_status`
- `issues_json`
- `suggested_fixes_json`
- `analyzed_at`

### Persisted draft change set

- `course_id`
- `changes_json`
- `created_at`
- `updated_at`

### Persisted gate state

- `course_id`
- `status`
- `blocking_issue_ids`
- `updated_at`

This intentionally avoids graph-version history in v1.

## API Contract

### Analyze graph

- `POST /api/v1/graph/qa/analyze/{course_id}`

Runs QA immediately and returns the latest full QA report.

### Read latest QA report

- `GET /api/v1/graph/qa/{course_id}`

Used by the Graph Health tab and course settings surfaces.

### Apply one fix immediately

- `POST /api/v1/graph/qa/fixes/{course_id}/apply`

Payload:

```json
{
  "fix_id": "fix_123"
}
```

### Stage multiple fixes in draft

- `POST /api/v1/graph/qa/fixes/{course_id}/draft`

Payload:

```json
{
  "fix_ids": ["fix_123", "fix_456"]
}
```

### Read draft change set

- `GET /api/v1/graph/qa/draft/{course_id}`

### Commit draft change set

- `POST /api/v1/graph/qa/draft/{course_id}/commit`

Commits staged changes into the graph, clears the draft, and re-runs QA.

### Remove one staged draft change

- `DELETE /api/v1/graph/qa/draft/{course_id}/items/{change_id}`

### Read adaptive gate state

- `GET /api/v1/graph/qa/gate/{course_id}`

This route is the lightweight dependency for recommendation and student-facing adaptive status UI.

## Adaptive System Integration

The recommendation system should consume the QA gate state instead of independently inferring graph trustworthiness.

### Behavior

- If gate status is `Adaptive Ready`, recommendation runs normally.
- If gate status is `Adaptive Limited`, recommendation may run with warning messaging.
- If gate status is `Adaptive Blocked`, recommendation and locked progression should fall back to non-adaptive behavior.

This keeps the boundary clean between graph validation and adaptive decision-making.

## Determinism Requirement

The QA engine and fix planner must be deterministic in v1.

Reasons:

- easier to test
- easier to explain
- safe enough to power a publish gate
- easier to debug when instructors disagree with a warning

If future versions use model assistance, the core gate decision should still remain deterministic.

## Testing Strategy

### Unit tests

Cover:

- cycle detection
- broken backbone path detection
- unreachable core node detection
- suspect `part_of` detection
- missing prerequisite detection
- redundant prerequisite detection
- fix proposal generation
- draft-commit mutation logic

### API tests

Cover:

- analyze route
- latest report route
- single-fix apply
- draft add and remove
- draft commit
- gate state route

### UI tests

Cover:

- Graph Health rendering
- gate banner states
- severity grouping
- issue-to-graph focus behavior
- inline fix actions
- draft change set review flow

### Integration tests

Cover the end-to-end instructor loop from graph import to adaptive-ready state.

## Rollout Plan

### Phase 1

- QA analyzer
- latest report persistence
- Graph Health tab
- read-only gate status

### Phase 2

- inline graph issues
- single-fix apply
- focused prerequisite edge editing

### Phase 3

- bulk safe fixes
- draft change set
- recommendation integration with adaptive gate state

## Risks and Controls

### False positives

Risk:
The system flags valid `part_of` edges as bad prerequisites.

Control:
Use critical-only blocking in v1 and keep non-critical fixes reviewable, not automatic.

### UI overload

Risk:
Too many warnings create a noisy instructor experience.

Control:
Group by severity, prioritize critical and high issues, and focus the top actionable problems first.

### Scope creep

Risk:
The graph editor grows into a full authoring platform too early.

Control:
Limit v1 edits strictly to prerequisite edge semantics and fix application flows.

## Success Criteria

This feature is successful when:

- instructors can identify why a graph is unsafe for adaptive learning
- critical prerequisite problems are visible before students experience bad guidance
- instructors can repair common prerequisite issues without leaving the graph workflow
- adaptive recommendation is blocked only when the graph is truly unsafe
- the system becomes more trustworthy because recommendation quality is protected by graph QA
