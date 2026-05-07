# Knowledge Graph Workspace Design

Date: 2026-05-07
Status: Approved for planning

## Goal

Reorganize the Knowledge Graph screen into a graph-first workspace where learners can always see the full course graph overview while still being able to inspect a focused cluster, chat with the tutor, and launch quizzes without losing context.

The new workspace must prioritize:

- always-visible full graph overview
- easier node discovery without manual panning hunts
- clearer node-to-node relationship lines
- graph-first screen balance, with roughly 65% of the screen dedicated to the graph workspace and 35% to contextual tutor actions
- preservation of the educational knowledge graph model rather than replacing it with a different visualization paradigm

## Problem Statement

The current screen asks one graph canvas to do too many jobs at once:

- show the whole course map
- act as the navigation surface
- act as the reading surface for node labels
- act as the focused cluster exploration view
- coexist with a large right-side tutor panel

This creates several user-facing problems:

- overview is not reliably visible as a full map
- users have to drag or pan to go hunting for nodes
- camera movement and zoom states can make users lose global context
- edge readability suffers because the same surface tries to support both overview topology and local detail reading
- the tutor side competes too aggressively with the graph for screen real estate

The result is that the graph feels harder to operate than the learning task itself.

## Product Decisions

These decisions were locked during brainstorming:

- Screen direction: graph-first workspace
- Graph layout ratio: approximately 65% graph, 35% contextual tutor/actions
- Overview model: overview plus focused detail, not a single all-purpose canvas
- Focus detail presentation: in-graph inset panel, not a separate split pane
- Context panel behavior: contextual width that expands for chat and quiz work, then relaxes back
- Visualization model: remain a knowledge graph, do not switch to mind map, timeline, or roadmap

## Non-Goals

This work does not include:

- abandoning the knowledge graph concept
- replacing the graph with a timeline, roadmap, or list-first UI
- rewriting the tutoring product outside the graph workspace
- building a complex authoring studio
- removing graph interactions in favor of only structured side panels

## Target Experience

### First Load

When the graph screen opens:

- the learner immediately sees the full course graph overview inside the graph zone
- the learner can identify the major clusters without panning
- the graph surface feels like the primary workspace
- the right-side tutor area is present but visually secondary

The opening feeling should be “I can see the whole map” rather than “I need to navigate before I understand anything.”

### Selecting A Cluster

When the learner clicks a main node or cluster anchor:

- the full overview remains visible in the background
- a focused inset appears inside the graph zone
- the inset shows the selected cluster at a readable scale
- labels and relationships inside the selected cluster become easier to inspect
- the learner does not lose awareness of where that cluster sits in the full course graph

### Working With Tutor Or Quiz

When the learner moves from exploration to action:

- the contextual tutor rail expands only as much as needed
- the graph remains visible and anchored as the dominant reference
- the learner can return to exploration without the screen feeling reconfigured around them

## UX Principles

- `Overview is sacred`: the full graph map must remain available at all times on desktop.
- `Graph first, tutor second`: the tutor supports graph exploration; it should not visually displace the map by default.
- `Separate scanning from reading`: overview is for orientation, focus inset is for detailed graph reading.
- `Context without teleportation`: interactions should reveal more detail without forcing users to mentally reconstruct where they are.
- `Relationship clarity over decorative density`: edge design should make connections legible, not merely visually interesting.

## Screen Architecture

The new screen should be treated as a knowledge graph workspace with two primary zones.

### Graph Zone

The graph zone should occupy about 65% of the desktop width.

Responsibilities:

- always show the full graph overview
- provide cluster selection and map-level navigation
- host the focus inset for selected clusters
- retain graph-aware controls for reset, fit, legend, and relation-visibility toggles

The graph zone is the primary surface for understanding the course structure.

### Context Zone

The context zone should occupy about 35% of the desktop width.

Responsibilities:

- chat input and active conversation
- node summary or node detail
- recommendation and next-step actions
- quiz launch and focused quiz workflow

The context zone should not permanently claim half the screen. Its width and prominence should adapt to the current task.

## Overview Surface

The overview surface should always behave like a global course atlas.

Requirements:

- all main clusters should fit into the default view
- the learner should not need to pan just to locate a major concept
- main node labels should remain visible in overview
- child nodes may be simplified, but the overall network structure should remain legible
- overview edge treatment should favor topology and route-tracing rather than full local detail

The overview surface is not the place to force users to read every child label. It is the place to understand structure.

## Focus Inset Surface

The focus inset should appear inside the graph zone as a second coordinated graph surface.

Responsibilities:

- show the selected cluster or local neighborhood at a readable scale
- render fuller labels and clearer edge semantics than the overview
- provide a controlled local exploration surface without replacing the overview
- offer direct actions such as:
  - ask tutor about this cluster
  - open node detail
  - start quiz
  - pin or clear focus

The inset should feel like a guided lens into the graph, not a modal that hides the map.

## Relationship Readability Model

The graph should use different edge reading priorities for overview and focus surfaces.

### Overview Edges

Overview edges should:

- show high-level topology clearly
- remain thin enough that the graph does not become a hairball
- preserve clear directionality for prerequisite-style relations
- avoid dense per-edge labeling

### Focus Inset Edges

Focus inset edges should:

- be more legible than overview edges
- use stronger contrast where needed
- make it easier to trace prerequisite, contains, and related paths
- support local relationship reading without overwhelming the overview surface

### Edge Semantics

At minimum:

- `prerequisite` must read as more important than `contains`
- structural edges must not visually overpower learning-path edges
- the learner should be able to tell what is the main dependency route and what is supporting structure

## Context Zone Behavior

The right-side panel should become a contextual learning rail rather than a fixed heavy split.

### Default State

In the default graph exploration state, the rail should be slim and calm.

It should prioritize:

- chat input
- current recommendation
- lightweight node summary
- quick actions

### Expanded Action State

When the learner enters a task-heavy mode such as quiz taking or longer tutoring interaction:

- the rail can temporarily widen
- the graph should still remain visible
- the rail should return toward its slimmer state when the focused action ends

This avoids wasting space when the learner is primarily exploring the graph.

## Responsive Behavior

### Desktop

- graph zone around 65%
- context zone around 35%
- focus inset rendered inside the graph zone

### Tablet And Small Desktop

- graph remains dominant
- contextual rail collapses further when inactive
- focus inset resizes and snaps to a safe position within the graph zone

### Mobile

- graph overview remains the primary screen
- focus inset becomes a bottom sheet or layered detail card
- chat and quiz tools move into secondary sheets or tabs

The mental model should stay consistent even when the exact layout adapts.

## Interaction Flow

Primary learning flow:

1. Learner opens the screen and sees the full graph overview.
2. Learner scans the map and selects a main cluster.
3. Focus inset opens inside the graph zone with readable local detail.
4. Learner chooses whether to:
   - inspect cluster detail
   - ask the tutor
   - start a quiz
   - follow the recommended next step
5. If the learner enters a deeper chat or quiz task, the context rail expands.
6. When the learner exits the deeper task, the graph-first workspace reasserts itself without losing graph context.

This flow keeps the graph as the stable anchor of the learning experience.

## Technical Architecture

The current single-canvas model should be replaced by two coordinated graph surfaces while keeping the same knowledge graph data model.

### Surface A: Overview Graph

Use the full course graph as the always-visible overview surface.

Responsibilities:

- fit and maintain the whole course map
- support high-level node selection
- provide graph-wide orientation

### Surface B: Focus Inset Graph

Use a cluster-scoped or neighborhood-scoped graph as an inset surface inside the graph zone.

Responsibilities:

- show selected local detail at a more readable scale
- render stronger local edge semantics
- support node-level actions without displacing overview

### Coordination Rules

The two surfaces should share:

- selected cluster identity
- selected node identity
- edge highlighting context
- recommendation and current-node state where relevant

They should not share the same camera or zoom behavior. Their jobs are intentionally different.

## Library Direction

The preferred first implementation direction is:

- keep Cytoscape for the overview surface
- keep Cytoscape for the focus inset surface as well, using a scoped subgraph and different style rules

Reasons:

- lower implementation risk than replacing the renderer
- reuse of existing graph mapping and relationship logic
- easier consistency between overview and inset semantics

Fallback direction if Cytoscape still proves too awkward for readable detail:

- keep Cytoscape for overview
- use a lighter structured cluster explorer or alternate local-detail renderer for the inset

This fallback is acceptable only if the first implementation proves that the inset still cannot achieve readable labels, stable spacing, and clear edges with Cytoscape.

## Data And State Requirements

The workspace likely needs explicit state for:

- overview selection
- active cluster id
- focus inset visibility
- focus inset subgraph payload
- current rail mode
- relationship filter mode

These are screen-level display concerns, not changes to the educational graph schema itself.

## Testing Strategy

The implementation should be verified in layers.

### Screen Layout Tests

Cover:

- graph-first width ratios on desktop
- contextual rail default and expanded states
- presence of both overview and focus inset surfaces

### Interaction Tests

Cover:

- selecting a main node opens the focus inset without replacing overview
- opening quiz or deeper chat expands the contextual rail
- clearing focus returns the workspace to overview-led mode

### Graph Semantics Tests

Cover:

- overview still contains all top-level clusters
- focus inset uses the correct subgraph or neighborhood slice
- relationship semantics stay consistent between overview and inset

## Risks And Mitigations

- `Risk: the two-surface model feels visually busy`
  Mitigation: keep inset restrained, clearly bounded, and secondary to the overview frame.

- `Risk: overview still becomes too dense to be useful`
  Mitigation: optimize overview for cluster visibility and global topology rather than local label completeness.

- `Risk: the contextual rail still steals too much attention`
  Mitigation: enforce graph-first defaults and only expand the rail during explicit action modes.

- `Risk: two Cytoscape surfaces introduce coordination complexity`
  Mitigation: keep shared state explicit and narrow; separate overview and inset responsibilities cleanly.

## Success Criteria

This design is successful when:

- users can always see the full course map in overview on desktop
- users no longer need to drag around the canvas just to find major nodes
- users can inspect a selected cluster without losing global graph context
- the graph clearly feels like the primary workspace
- edge relationships are easier to follow in both overview and local detail
- the tutoring surface supports learning actions without visually dominating the graph
