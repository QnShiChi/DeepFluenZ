# Knowledge Graph UX Refinement Design

Date: 2026-05-07
Status: Approved for planning

## Goal

Refine the current Cytoscape-based knowledge graph so it feels like a guided learning map rather than a technical network.

The refinement must improve:

- readability of main concepts at initial load
- visual hierarchy between main concepts and child concepts
- spacing rhythm across the graph
- edge clarity and path-following
- expand/collapse smoothness
- cognitive focus when clusters grow large
- zoom behavior across overview and detailed exploration
- overall visual polish for a modern educational AI product

The work should preserve the current educational graph model:

- main concept to sub concept hierarchy
- expand/collapse interaction pattern
- Cytoscape renderer
- graph-side integration with recommendation, timeline, QA, and node detail surfaces

## Problem Statement

The current graph works functionally, but it still reads like an engineering visualization instead of a learning experience.

Current pain points:

- node labels are too small and cramped inside fixed circular shapes
- initial fit tries to show too much at once, so users must zoom before they can read
- top-level nodes and child nodes are not differentiated strongly enough
- radial spacing is too uniform for clusters with very different densities
- edges still pull too much attention relative to nodes
- expand/collapse feels abrupt rather than fluid
- large expanded views create cognitive overload because everything competes equally
- zooming does not yet adapt information density to reading distance

The result is that users can technically navigate the graph, but the graph does not yet feel calm, readable, or inviting to explore.

## Product Decisions

These decisions were locked during brainstorming:

- Primary UX priority: exploration flow
- Click behavior: hybrid expand plus focus
- Visual direction: moderate refresh of the existing green and blue educational palette
- Architecture direction: refine the existing Cytoscape implementation instead of replacing the graph concept or renderer

## Non-Goals

This work does not include:

- redesigning the graph as a mind map, roadmap, or timeline
- replacing Cytoscape with another library
- rewriting the right-side tutor or chat layout
- changing the educational import model or hierarchy semantics
- building a full graph authoring experience
- introducing flashy or game-like motion

## Target Experience

### Initial Load

When the graph first appears:

- users should immediately recognize the main concepts
- most main concept labels should be readable without an immediate manual zoom
- the view should frame the graph for scanning, not for maximum node count
- the graph should feel spacious and calm

The opening impression should be “I can explore this” rather than “I need to wrestle the canvas first.”

### Exploring a Main Concept

When a user clicks a main concept:

- the cluster expands smoothly
- the selected cluster becomes the visual reading layer
- connected nodes stay prominent
- unrelated nodes dim without disappearing
- connected edges receive light emphasis
- the camera nudges toward the cluster without a disruptive refit

This preserves the context of the full graph while making the local neighborhood easier to read.

### Exploring Deeply

When multiple clusters are open or the user zooms in:

- the graph should continue to feel structured
- labels should become richer only when there is enough screen space
- focus states should reduce cognitive overload instead of amplifying it
- expanded nodes should not produce a hairball of equally strong signals

## UX Principles

- `Readable before dense`: do not trade first-glance readability for maximum visible content.
- `Hierarchy over uniformity`: major learning anchors must feel visually different from supporting nodes.
- `Context without clutter`: keep enough surrounding context visible, but lower its priority when a cluster is active.
- `Motion as guidance`: transitions should help orientation, not show off.
- `Quiet defaults, expressive focus`: the resting graph should be calm; interactions should reveal emphasis.

## Visual Direction

The graph should move toward a premium educational SaaS feel with inspiration from:

- Linear clarity
- Notion calmness
- Obsidian-style graph exploration
- tldraw-like softness in interactive motion

The visual treatment should keep the current semantic color language:

- green family for main learning anchors
- blue family for child knowledge units
- refined neutrals for surfaces, labels, and edges

Allowed polish:

- soft shadows
- subtle gradients
- restrained glow
- smoother hover states
- slightly richer surface depth

Disallowed polish:

- heavy glassmorphism
- loud neon effects
- playful motion that distracts from study

## Node System

## Hierarchy Model

The graph should use a stronger two-level visual hierarchy.

### Main concept nodes

Main concepts should:

- use a noticeably larger base size than children
- use stronger font weight
- allow more label width and wrap space
- carry a clearer border and slightly higher elevation
- use a soft green gradient or tonal fill instead of a flat fill

Target behavior:

- readable at initial overview
- visually recognized as cluster anchors
- easy to distinguish even when the graph is zoomed out somewhat

### Child nodes

Child nodes should:

- remain clearly readable, but be smaller than main concepts
- use a lighter fill and lower elevation
- keep font size high enough for learning labels without looking dominant
- act as secondary visual information until focused or expanded

### State treatment

Node state should rely on more than color alone.

Recommended state signals:

- `current`: brighter border, slightly stronger glow, elevated shadow
- `recommended`: accent halo or ring treatment
- `expanded`: subtle emphasis that indicates the node is acting as an active hub
- `locked`: lower saturation and softer contrast instead of aggressively reducing text legibility
- `issue/remediation`: semantic accent treatment that does not overpower the graph

## Label Behavior

Node labels should adapt to zoom level instead of trying to show full text at all times.

- far zoom:
  - preserve backbone labels where possible
  - simplify or hide low-priority child labels
- mid zoom:
  - show full main labels
  - show focused or important child labels
- near zoom:
  - show full wrapped child labels
  - preserve comfortable line height and padding

Text should never feel squeezed into shapes. If needed, node dimensions and text width should increase together.

## Layout And Spacing System

## Backbone Spacing

The backbone radial layout should move from a mostly uniform ring spacing model to a readability-first spacing model.

Requirements:

- more room between main concept nodes
- more room left around each node for future cluster expansion
- more balanced framing when the graph first loads
- less pressure to shrink everything just to fit the viewport

The layout may still use a radial backbone, but the ring sizing should support readable scanning instead of compact packing.

## Cluster Spacing

Expanded clusters should use density-aware spacing.

That means:

- small child sets should not look too loose
- large child sets should not collapse into cramped circles
- cluster radius should grow based on child count and label footprint
- second-ring behavior may be used only when density justifies it

The visible rhythm should feel intentional across sparse and dense lessons.

## Overlap Avoidance

The spacing system should explicitly reduce:

- child-child overlap
- child-hub overlap
- edge congestion near the hub
- collisions between nearby expanded clusters

The design does not require a brand-new layout engine, but it does require better heuristics than a fixed cluster radius.

## Edge System

Edges should support comprehension without dominating the composition.

### Default edge behavior

At rest, edges should:

- use softer opacity
- remain thinner than current dominant node outlines
- use smooth curved geometry where appropriate
- visually separate structural edges from learning-path edges

### Edge hierarchy

- `prerequisite`:
  - strongest edge treatment
  - directional and readable
  - still quieter than active nodes
- `contains`:
  - lightweight structural connector
  - clearly subordinate to nodes
- contextual relations such as `related_to`:
  - low-priority enrichment treatment
  - shown only when relevant to the current view

### Interactive edge emphasis

On hover or selection:

- connected edges should increase opacity
- active paths may gain a small width increase
- glow should be minimal and used only for active paths

The goal is guided reading, not a luminous network effect.

## Focus And Overload Management

The graph needs an explicit focus system for large views.

### Active reading layer

When a node is selected:

- the selected node and its local neighborhood become the active reading layer
- connected nodes retain strong opacity and contrast
- sibling nodes remain visible but secondary
- unrelated nodes dim
- unrelated edges fade more aggressively than unrelated nodes

### Cluster-first focus

Because the selected interaction model is hybrid, focus should support expansion rather than replace it.

When a main concept is clicked:

- expand the cluster
- elevate the cluster visually
- keep global context around it
- avoid aggressive hiding or teleporting

This should feel like the graph is helping the user “lean into” a concept.

## Zoom UX

The graph should use zoom-based level of detail with three tiers.

### Far zoom

Purpose:

- scan course structure
- keep orientation

Behavior:

- prioritize main concepts
- simplify child label density
- keep edges subdued
- preserve overview calmness

### Mid zoom

Purpose:

- explore clusters
- compare nearby concepts

Behavior:

- show full main labels
- show active cluster children more clearly
- make focus states legible

### Near zoom

Purpose:

- read local detail
- inspect relationships around a node

Behavior:

- show full child labels
- allow richer focus and hover cues
- increase detail without changing the underlying graph structure

The graph should remain readable at every tier, rather than becoming either too empty or too noisy.

## Motion And Camera Behavior

Motion should feel modern and alive, but restrained.

### Expand and collapse

Recommended motion profile:

- short duration
- soft ease or light spring feel
- fade plus slight positional settling for children

Expand should feel guided and smooth rather than abrupt.

### Camera behavior

When a main concept is selected:

- pan and zoom slightly toward the active cluster
- avoid full refit of the entire graph
- keep transitions short enough to maintain control

The camera should act like a subtle guide, not an automatic driver.

### Hover behavior

Hover should:

- increase node elevation slightly
- clarify border emphasis
- preview connected path emphasis only for the directly connected neighborhood

Hover should never cause major layout or focus changes by itself.

## Implementation Shape

The work should stay within the current graph implementation boundaries.

## Components

### `KnowledgeGraphViewer`

Should continue to own:

- selected node
- expanded cluster ids
- recommendation and current node state
- high-level visibility mode
- focus state for active cluster or selected neighborhood
- fit or camera triggers passed into the canvas

### `CytoscapeGraphCanvas`

Should be extended to own runtime rendering behaviors such as:

- class-based focus and dim updates
- zoom threshold listeners
- camera animation between graph states
- hover and active edge emphasis

### Graph style layer

`cytoscape-graph-styles.ts` should evolve from a static style list into a style system that supports:

- stronger hierarchy classes
- focus and dim classes
- zoom-tier-specific class toggles or style variants
- quieter default edges and richer active states

### Layout layer

`cytoscape-knowledge-graph-layout.ts` should evolve to support:

- larger backbone spacing
- density-aware child cluster radius
- more balanced fit framing
- overlap-reduction heuristics for expanded clusters

## Suggested Data And State Additions

The existing mapping and view state likely need explicit support for:

- `isFocused`
- `isContextual`
- `isDimmed`
- `zoomTier`
- `activeClusterId`
- `labelDensityMode`

These can remain view-only display concerns and do not need to affect the backend graph schema.

## Testing Strategy

This refinement should add or update tests in three layers.

### Mapper and layout tests

Cover:

- focus and dim class assignment
- visibility rules across zoom tiers where the mapping layer participates
- density-aware cluster spacing heuristics
- backbone spacing constraints that preserve readability goals

### Canvas behavior tests

Cover:

- zoom-tier transitions
- fit and camera triggers
- click-to-focus and click-to-expand coordination
- hover and active edge styling triggers where testable

### Viewer integration tests

Cover:

- hybrid click behavior
- preserved node detail interactions
- reduced visibility emphasis on unrelated nodes while keeping context
- stable behavior with recommendation, remediation, and timeline state present

## Rollout Strategy

Implement in slices so the graph remains shippable throughout:

1. strengthen node hierarchy and edge quietness
2. improve spacing and initial framing
3. add focus and dim behavior
4. add zoom-tier detail behavior
5. add motion and camera polish

This sequence delivers visible improvement early while reducing regression risk.

## Risks And Mitigations

- `Risk: improved focus makes users feel lost`
  Mitigation: dim unrelated content instead of hiding it; keep camera moves short.

- `Risk: larger nodes reduce visible graph area too much`
  Mitigation: tune initial framing and zoom-tier visibility together instead of sizing nodes in isolation.

- `Risk: added style states become hard to reason about`
  Mitigation: keep semantic classes small and explicit; separate hierarchy classes from interaction classes.

- `Risk: spacing changes break current tests or assumptions`
  Mitigation: update layout tests around readable constraints instead of brittle exact coordinates.

## Success Criteria

The refinement is successful when:

- users can read most main concepts on first load without immediate zooming
- main concepts are visually distinguishable from child concepts at a glance
- clicking a main concept feels smooth and guided
- expanded clusters feel focused rather than chaotic
- zooming preserves readability at overview and detail levels
- the graph feels more premium and more educational, not merely more decorative
