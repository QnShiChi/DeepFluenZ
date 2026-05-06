# Hierarchical Knowledge Graph Design

## Goal

Redesign the course Knowledge Graph so it can represent large lessons, nested subtopics, and finer-grained concept nodes in a way that remains readable, interactive, and compatible with adaptive learning features.

The current graph is too flat for real syllabi:

- node layout is mostly fixed and easy to overlap
- major lesson nodes do not expose enough internal structure
- syllabus sections such as `Bài 3`, `3.1`, `3.2`, `3.3` are not preserved as first-class hierarchy
- enrichment does not reliably produce enough child concepts inside major topics

The new graph should look and behave more like a clustered concept map:

- large lesson hubs
- visible child nodes around each hub
- expandable clusters when the graph becomes dense
- auto-layout by default with manual drag overrides

## Product Outcome

At the end of the first full rollout, DeepTutor should be able to:

- generate a hierarchical graph from syllabus structure
- preserve lesson and subtopic numbering such as `Bài 1`, `1.1`, `1.2`, `3.1`
- enrich each lesson or subtopic with additional concept, skill, or application nodes
- render the graph in `overview` and `expanded` modes
- let users drag nodes and clusters to resolve collisions
- persist user-adjusted layout without breaking future graph refreshes
- keep recommendation, remediation, review, and timeline features compatible with the richer graph

## Scope

### In scope

- hierarchical graph schema for course templates
- syllabus-first structure extraction
- controlled semantic enrichment for concept children
- explicit edge semantics for hierarchy and learning dependency
- clustered graph rendering in the web viewer
- expand and collapse behavior for child nodes
- auto-layout plus manual drag-and-drop override
- persisted layout state per course and user or session
- adaptive-logic compatibility at lesson and subtopic level

### Out of scope

- freeform instructor graph editing in v1
- concept-level mastery as the primary adaptive unit in v1
- collaborative multi-user layout editing
- full graph version history and branching
- arbitrary custom edge authoring in the viewer
- replacing existing recommendation or review policy logic in the same project

## Current Constraints

The current system already has:

- a course Knowledge Graph import pipeline
- graph-backed recommendation, remediation, and review flows
- a React Flow-based `KnowledgeGraphViewer`
- node-level course progress and timeline explanation surfaces

The current system does not yet have:

- a true hierarchical graph schema
- cluster-aware rendering
- expand and collapse behavior for subgraphs
- persisted manual layout override
- a generation pipeline that reliably maps `lesson -> subtopic -> concept`

## Recommended Approach

Use a hierarchical clustered graph model with dual-view rendering:

1. Generate a structured tree from the syllabus backbone.
2. Enrich each lesson or subtopic with limited child concepts.
3. Render the result as a graph with two presentation modes:
   - `overview`
   - `expanded`
4. Use automatic layout as the default, then allow manual drag persistence as an override layer.
5. Keep adaptive decisions primarily at lesson and subtopic level in the first rollout.

This approach is recommended because it solves the main structural problem without forcing the adaptive engine to immediately operate at the most granular concept level.

## Why This Approach

Keeping the graph flat would preserve implementation simplicity, but it would not solve the actual instructional or layout problem. Large syllabi would still collapse into visually noisy maps.

Jumping immediately to concept-level adaptive decisions would add too much risk. The product needs a better graph first, then deeper decision logic later.

A hierarchical clustered graph gives the system a better representation of the course while preserving a safe migration path:

- structure becomes richer
- UI becomes more navigable
- adaptive logic remains stable enough to ship incrementally

## Product Principles

- The syllabus structure is the backbone, not a loose hint.
- Graph hierarchy should clarify the course, not overwhelm the learner.
- Auto-layout must be good enough before manual drag is needed.
- Expand and collapse should reduce clutter, not hide essential progress signals.
- `contains` and `prerequisite` must stay semantically distinct.
- Adaptive features should degrade gracefully when concept enrichment is incomplete.

## User Experience

### Overview mode

The learner first sees major lesson hubs and only the most important path-level structure. This keeps the graph readable for large courses.

Examples:

- `Bài 1: Giới thiệu về OOP`
- `Bài 2: Các khái niệm cơ sở của OOP`
- `Bài 3: Giới thiệu về Java`

### Expanded mode

When the learner focuses or expands a lesson hub, child nodes appear around that hub.

Examples:

- `3.1 Môi trường Java`
- `3.2 Cấu trúc chương trình Java`
- `3.3 Các phần tử cơ sở trong Java`

Optionally, a subtopic may also reveal concept children such as:

- `main method`
- `class structure`
- `System.out.println`
- `import`

### Manual layout override

Users may drag nodes or clusters to avoid overlap and create a clearer view for themselves.

The system should support:

- drag a child node inside a cluster
- drag a parent cluster as a group
- reset layout for one cluster
- reset layout for the whole graph
- auto-tidy for a messy cluster

### Recommendation compatibility

Recommendation surfaces should remain understandable even when the graph is richer:

- recommendation may still target a lesson or subtopic
- expanded graph shows the finer structure behind that recommendation
- review or remediation may explain that a larger node contains weaker internal concepts

## Graph Model

The graph should move from a flat node list to a hierarchical graph with explicit containment.

### Node levels

The schema should support at least these levels:

- `lesson`
  Major course units such as `Bài 1`, `Bài 2`, `Bài 3`

- `subtopic`
  Structured children such as `1.1`, `1.2`, `3.1`, `3.2`

- `concept`
  Finer semantic units extracted or enriched under a lesson or subtopic

- `skill`
  Action-oriented child knowledge where appropriate

- `application`
  Real-world or exercise-oriented child knowledge where appropriate

### Node metadata

Each node should support:

- `node_id`
- `title`
- `description`
- `node_type`
- `hierarchy_level`
- `parent_node_id`
- `ordinal`
- `source_label`
- `source_path`
- `difficulty`
- `layout_group_id`
- `layout_priority`

### Edge types

The graph must separate hierarchy from dependency.

Required edge types:

- `contains`
  Parent-child structure only

- `prerequisite`
  Learning dependency only

- `related_to`
  Semantic relation without gating behavior

`contains` edges should not be treated as prerequisites by the recommendation engine.

## Graph Generation Pipeline

The generation pipeline should become a two-stage process with a final normalization pass.

### Stage 1: Structure extraction

Input:

- syllabus or course outline
- table rows such as `Bài 1`, `1.1`, `1.2`, `3.1`, `3.2`

Responsibilities:

- detect lesson blocks
- detect numbered child subtopics
- preserve source ordering
- build `lesson -> subtopic` tree
- keep titles close to the original syllabus wording

This stage should be deterministic or near-deterministic whenever the input structure is explicit.

### Stage 2: Semantic enrichment

Input:

- normalized lesson and subtopic tree from Stage 1

Responsibilities:

- enrich a lesson or subtopic with a bounded number of child concepts
- create `concept`, `skill`, or `application` nodes where instructional value is clear
- add `related_to` and selective `prerequisite` edges when confidence is high

Enrichment should happen locally per lesson or subtopic, not by asking the model to reorganize the whole course at once.

### Stage 3: Graph normalization

Responsibilities:

- ensure stable ids
- cap child-node fanout
- deduplicate repeated concepts
- validate parent-child relationships
- ensure every non-root node has a valid parent when required
- reject or downgrade uncertain prerequisite edges

## Enrichment Rules

To avoid graph explosion, concept generation must be constrained.

### Child count guidelines

- each `lesson` should expose a manageable number of `subtopic` children from the syllabus
- each `subtopic` should enrich to a limited number of concept children
- enrichment should prefer fewer, stronger concepts over many shallow labels

### Priority rules

Prefer concepts that are:

- central to understanding the subtopic
- likely to be reused later
- teachable as independent micro-units
- useful for review, remediation, or explanation

Avoid concepts that are:

- trivial rephrasings of the parent title
- highly redundant across siblings
- too small to matter in navigation or adaptive explanation

## Viewer and Layout Architecture

The viewer should be redesigned around cluster-aware rendering rather than fixed x and y placement by node type.

### Rendering model

The viewer should support:

- `overview` rendering for major hubs
- `expanded` rendering for one or more focused clusters
- mixed rendering where only selected clusters are expanded

### Layout model

Use two layout layers:

- `global layout`
  Places major lesson hubs and large prerequisite paths

- `cluster layout`
  Places subtopics and concept children relative to their parent cluster

### Auto-layout requirements

The auto-layout engine should:

- reduce immediate overlap between clusters
- preserve visible path direction
- keep children visually associated with their parent
- leave enough spacing for edge labels and interactive controls

### Manual override requirements

Manual override should:

- not replace auto-layout permanently
- be stored as a layout delta relative to the generated graph
- be scoped so schema changes do not corrupt all old saved layouts

## Layout Persistence Model

Persist layout state separately from the graph template itself.

Each saved layout should be keyed by:

- course id
- user or session id
- graph version or layout fingerprint

Each saved record should store:

- expanded cluster state
- node or cluster position overrides
- timestamp
- layout schema version

If the graph structure changes significantly, old layout overrides should be partially migrated when safe and discarded when unsafe.

## Adaptive Compatibility

The new graph should distinguish between:

- `navigation graph`
- `learning decision graph`

### Navigation graph

Full hierarchical graph used for exploration, visibility, and mental-model support.

### Learning decision graph

A derived view used by recommendation, remediation, and review systems.

For the first rollout, the decision layer should still prioritize:

- lesson-level decisions
- subtopic-level decisions where available

Concept nodes may support explanation and future expansion, but they should not become mandatory adaptive units in v1.

## API and Contract Changes

The platform will need contract changes across template storage and web rendering.

### Course template contract

The stored graph template should carry:

- hierarchy metadata
- new node types or hierarchy levels
- `contains` edges
- layout hints for initial rendering

### Viewer contract

The frontend should receive enough metadata to:

- render parent and child nodes differently
- determine which clusters are expandable
- apply local layout strategies
- persist and restore overrides safely

### Backward compatibility

Existing flatter templates should still render through a compatibility path, even if they cannot use the full hierarchical experience immediately.

## Rollout Plan

### Phase 1: Schema and generator refactor

Goals:

- introduce hierarchical graph schema
- extract `lesson -> subtopic` structure from syllabus
- add local concept enrichment
- keep current viewer functioning with a compatibility mapping

Success criteria:

- imported syllabus preserves numbered hierarchy
- child concepts exist for major topics
- no breaking regression in current recommendation APIs

### Phase 2: Cluster viewer and layout system

Goals:

- implement overview and expanded modes
- add cluster-aware auto-layout
- add drag-and-drop override with persistence
- add reset and auto-tidy actions

Success criteria:

- cluster expansion is readable
- node overlap becomes significantly less common
- user layout survives reload for the same graph version

### Phase 3: Deeper adaptive integration

Goals:

- improve recommendation and review explanations using subtopic and concept structure
- allow more precise remediation targeting
- optionally begin concept-aware mastery tracking where confidence is high

Success criteria:

- richer graph does not reduce recommendation clarity
- remediation and review can point to meaningful internal weak areas

## Risks

### Graph explosion

Too many enriched nodes will make the graph unreadable and slow.

Mitigation:

- strict child-count limits
- enrichment scoring and pruning
- overview mode as default

### Semantic confusion between edge types

If `contains` and `prerequisite` blur together, adaptive behavior will become unreliable.

Mitigation:

- contract-level distinction
- QA rules for invalid edge use
- recommendation engine ignores `contains` as a gating edge

### Layout instability

Saved manual layouts may break when the graph changes shape.

Mitigation:

- store override deltas, not only absolute raw snapshots
- version layout records by graph fingerprint
- allow graceful fallback to fresh auto-layout

### UI overload

Expanding too much by default can overwhelm learners.

Mitigation:

- overview-first UX
- selective cluster expansion
- bounded label density

## Testing Strategy

### Generator tests

Verify that syllabus input like:

- `Bài 3`
- `3.1`
- `3.2`
- `3.3`

produces:

- stable lesson hubs
- correct child subtopics
- valid parent-child relationships
- bounded concept enrichment under the right parent

### Schema and contract tests

Verify backend and frontend both understand:

- new node metadata
- `contains` edges
- compatibility fallback for old templates
- persisted layout records

### Viewer tests

Verify:

- overview rendering
- expand and collapse behavior
- drag persistence
- reset layout behavior
- cluster-focused auto-layout
- collision reduction behavior

### Adaptive regression tests

Verify:

- recommendation still works on hierarchical graphs
- review queue still targets meaningful nodes
- remediation still anchors to the intended lesson or subtopic
- timeline explanations still map to visible graph elements

## Success Metrics

Track a small set of practical outcomes:

- reduction in visibly overlapping nodes on initial render
- percentage of imported syllabi that preserve numbered hierarchy correctly
- percentage of major lessons that receive usable child concepts
- learner use of expand and collapse behavior
- learner use of drag-and-drop and layout reset
- no material regression in recommendation or remediation success flows

## Recommended Next Step

The next implementation plan should treat this as a graph-platform refactor with three linked streams:

- schema and generation
- viewer and layout
- adaptive compatibility

The first implementation milestone should prioritize getting the hierarchical data model and syllabus structure extraction correct before replacing the current viewer behavior.
