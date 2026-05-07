# Cytoscape Knowledge Graph Design

Date: 2026-05-07
Status: Approved for planning

## Goal

Replace the current `React Flow` knowledge graph renderer with `Cytoscape.js` so the graph behaves like a real knowledge-map viewer:

- radial / cluster-oriented visual language
- backbone-first default view
- expand one lesson cluster into subtopics and child concepts
- drag-to-adjust with saved layout overrides
- better visual separation between structure edges and learning-path edges

The new graph must preserve existing adaptive features:

- recommendation card
- review queue
- remediation state
- learning timeline
- graph QA / health panel

This migration is explicitly intended to solve the current UX failure mode where imported syllabus graphs become long vertical stacks with overlapping `contains` edges and unreadable labels.

## Problem Statement

The current renderer is built on `@xyflow/react` (`React Flow`) and a very simple custom layout strategy:

- `lesson/topic` nodes are placed on one x-column
- other nodes are placed on a second x-column
- y-position is mostly index-based
- expanded children are distributed in a local circle around a parent

This works for very small graphs, but it breaks down for hierarchical syllabus imports:

- lessons collapse into a tall vertical list
- `contains` edges stack on top of each other
- node labels are cramped into narrow cards
- the graph looks like an editor canvas instead of a knowledge map
- the current layout logic is too weak to support the desired radial cluster UX

`Cytoscape.js` is a better fit because it is designed as a graph visualization engine first, not primarily a node editor.

## Product Decisions

These decisions are locked in from brainstorming:

- Renderer: `Cytoscape.js`
- Interaction style: hybrid viewer/editor
- Default layout style: radial / cluster map
- Initial screen: show backbone only
- Expanded behavior: clicking a lesson expands its cluster
- Layout persistence: auto-layout first, manual drag override second

## Non-Goals

This project does not include:

- building a full graph authoring tool
- live edge creation/deletion by end users
- rewriting adaptive recommendation logic
- concept-level mastery rollout in the same phase
- redesigning the entire right-side chat/tutor surface

## Target Experience

### Initial View

When a course graph loads:

- only top-level `lesson` / backbone nodes are visible
- lessons are arranged as a radial knowledge map, not a vertical column
- prerequisite edges between backbone nodes remain visible
- `contains` edges to hidden children are not shown

The user should immediately understand the course structure without being overwhelmed by subtopics.

### Expanded Lesson

When a lesson is opened:

- that lesson acts as the hub
- its `subtopic` children appear around it in a radial cluster
- optional concept/skill/application children may appear only when that lesson or a subtopic is expanded deeply enough
- `contains` edges in the expanded cluster are visible but visually lightweight
- prerequisite and recommendation-related edges remain visually stronger

### Manual Adjustment

Users may:

- drag a lesson node
- drag nodes within an expanded cluster
- keep a personally adjusted layout
- use `Reset layout` to return to auto-layout

The graph should still feel like a viewer first. Manual dragging is for refinement, not for basic usability.

## Architecture

## High-Level Structure

The current `KnowledgeGraphViewer` will remain the orchestration layer. A new Cytoscape canvas component will replace the `ReactFlow` render layer.

Planned split:

- `KnowledgeGraphViewer`
  - loads graph template, recommendation, review queue, QA, timeline, remediation state
  - owns UI state such as selected node, expanded lesson ids, layout overrides, view mode
  - translates adaptive state into display state

- `CytoscapeGraphCanvas`
  - creates and manages a Cytoscape instance
  - renders elements
  - handles zoom/pan, click, expand/collapse, drag callbacks
  - applies visual styles and layout runs

- `cytoscape graph mapper`
  - converts `CourseKnowledgeGraph` + UI/adaptive state into Cytoscape elements
  - assigns semantic classes and data fields for styling and interaction

- `layout controller`
  - computes initial backbone radial layout
  - computes expanded lesson cluster radial layout
  - merges persisted drag overrides

This separation keeps adaptive logic independent from the rendering library.

## Display Graph State

The UI should stop thinking in `React Flow` nodes and edges. Instead, it should build a library-agnostic display graph state shaped for graph visualization.

Core pieces:

- `elements`
  - Cytoscape nodes and edges
  - include ids, labels, kinds, hierarchy, state flags, and visual class hints

- `display filters`
  - backbone-only
  - expanded lesson cluster(s)
  - optional deep concept visibility

- `layout snapshot`
  - persisted manual positions keyed by course and graph version

- `selection / focus state`
  - selected node
  - recommended node
  - current learning node
  - remediation target
  - review due node

## Data Mapping

### Node Mapping

Backend graph node types map as follows:

- `lesson`
  - backbone nodes
  - always eligible for initial view
  - major visual hubs

- `subtopic`
  - first-level children of a lesson
  - visible when their parent lesson cluster is expanded

- `concept`, `skill`, `application`
  - hidden by default
  - shown only in expanded/deep cluster states
  - rendered as smaller satellite nodes

Each mapped node should carry at least:

- `id`
- `label`
- `kind`
- `parentId`
- `hierarchyLevel`
- `graphState`
- `issueSeverity`
- `isRecommended`
- `isCurrent`
- `isReviewTarget`
- `isRemediationTarget`
- `isExpanded`

### Edge Mapping

Edge semantics must remain distinct:

- `prerequisite`
  - learning path edges
  - stronger contrast and clearer direction

- `contains`
  - structural hierarchy edges
  - lighter stroke, less visual emphasis

- `related_to`, `builds_skill`, `applies_to`, `example_of`
  - contextual or enrichment edges
  - only shown when relevant to expanded clusters or deep view

The renderer must not treat all edges equally. That is one of the core reasons the current graph feels noisy.

## Layout Strategy

## Default Backbone Layout

The default course view uses a radial knowledge-map arrangement for lesson nodes.

Requirements:

- preserve relative learning sequence enough that users can still read the course path
- avoid a strict vertical chain
- leave enough whitespace for opening one cluster without immediate collision
- keep the current or recommended lesson near a visually meaningful location when possible

If a pure radial algorithm becomes too chaotic for very long syllabi, the layout controller may use a constrained radial arrangement that respects ordering while still feeling non-linear.

## Expanded Cluster Layout

When a lesson is expanded:

- the lesson remains the cluster hub
- subtopics are placed around it in a radial ring
- child concepts may occupy a second ring or a lighter inner grouping depending on density

Constraints:

- one expanded lesson should remain readable without forcing users to drag first
- labels must not overlap the hub node
- cluster layout must leave room for edge labels or edge styling without producing a hairball

## Manual Overrides

Manual dragging should override auto-layout for specific nodes.

Rules:

- persisted positions should apply after the auto-layout result is computed
- layout overrides should be versioned by graph identity so old saved positions do not corrupt a changed graph
- `Reset layout` should remove overrides and rerun auto-layout

## Interaction Model

## Primary Interactions

- click lesson node
  - select node
  - optionally expand/collapse cluster

- click subtopic/concept node
  - select node
  - open detail panel / show recommendation context

- drag node
  - persist layout override

- click recommendation target
  - focus node and expand the necessary lesson cluster

- click review/remediation target
  - focus node and open the right supporting panel or workflow

## Secondary Interactions

- zoom / pan
- fit graph to viewport
- reset layout
- collapse expanded cluster
- future: tidy cluster

## Adaptive Compatibility

The renderer migration must not change the meaning of adaptive state.

The adaptive engine may continue to operate mostly at:

- lesson level
- subtopic level

The Cytoscape view only changes how those states are shown.

Examples:

- recommendation card still points to a node id
- review queue still points to nodes that may now visually live inside clusters
- remediation target still marks a node and can trigger focus/expand behavior
- timeline actions still focus a node and open the relevant cluster if hidden

This keeps product behavior stable while improving readability.

## Persistence

Persisted graph display state should include:

- current selected node id
- expanded lesson cluster ids
- manual layout overrides
- current view mode

Persistence keying should be scoped by:

- `courseId`
- graph version or graph signature

This avoids stale layouts from older graph snapshots.

## Styling

Visual semantics should become explicit:

- lesson hubs: larger, stronger fill, clearer typography
- subtopics: medium nodes with readable labels
- concept nodes: smaller supporting nodes
- current node: highlighted focus ring
- recommended node: distinct accent
- remediation target: alert styling
- review due node: softer warning styling
- locked nodes: muted
- mastered nodes: success styling

Edge styling:

- `prerequisite`: darker and directional
- `contains`: light and structural
- enrichment edges: subtle and context-dependent

Label behavior:

- truncate aggressively in-node
- show full text in detail panel or tooltip
- never rely on multi-line cramped boxes as the primary reading mode

## Rollout Plan

### Phase 1: Cytoscape Render Migration

- add Cytoscape dependencies
- create `CytoscapeGraphCanvas`
- map backbone lesson/subtopic graph into Cytoscape
- show backbone-only initial view
- support one expanded lesson cluster
- preserve current side panels

### Phase 2: Layout And Interaction Polish

- persist drag overrides
- refine radial cluster spacing
- improve semantic styling
- improve label truncation / hover detail
- ensure focus-to-node flows work for recommendation and timeline

### Phase 3: Deep Graph UX

- deeper concept expansion
- focus mode around current/recommended node
- cluster tidy behavior
- tighter integration of QA, timeline, review, and remediation cues

## Risks

### Library Migration Complexity

`Cytoscape.js` uses a different event and lifecycle model from `React Flow`. The migration must avoid mixing both render mental models in the same component for too long.

### State Drift

If the code keeps too much `React Flow`-shaped state after migration, the renderer will remain hard to reason about. The display graph state abstraction is necessary to avoid this.

### Radial Overload

Radial layouts look good for a few visible clusters but degrade quickly if too many are opened at once. The product must keep initial visibility constrained.

### Performance

Large course graphs with enrichment children can still become heavy. Hidden-by-default concept nodes and progressive expansion are required.

## Testing Strategy

### Mapper Tests

Verify:

- backend graph maps to correct Cytoscape elements
- hierarchy metadata is preserved
- semantic state flags are correct

### Visibility Tests

Verify:

- overview shows only backbone lesson nodes
- expanding a lesson shows its children
- collapsing hides them again

### Layout Tests

Verify:

- backbone layout does not collapse into a simple vertical column
- expanded cluster nodes are positioned around the hub
- overrides replace auto-layout output consistently

### Interaction Tests

Verify:

- node selection
- expand/collapse behavior
- drag persistence
- reset layout behavior

### Adaptive Regression Tests

Verify:

- recommendation highlighting still works
- remediation target still focuses correctly
- timeline actions still reveal hidden targets
- review queue nodes still surface correctly in the graph

## Success Criteria

The migration is successful when:

- imported syllabus graphs no longer appear as unreadable vertical stacks
- backbone lessons are legible at first glance
- expanding a lesson feels like opening a knowledge cluster, not revealing a broken column
- users can drag for refinement, but the auto-layout is already good enough by default
- adaptive recommendation and remediation flows still work without regression

