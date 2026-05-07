# Cytoscape Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current React Flow knowledge graph renderer with a Cytoscape.js-based radial knowledge-map viewer that keeps adaptive recommendation, remediation, review, QA, and timeline flows working.

**Architecture:** Keep `KnowledgeGraphViewer` as the orchestration shell and introduce a Cytoscape render layer plus a library-agnostic display-graph mapper. Land the work in small increments: add Cytoscape dependencies and canvas, build Cytoscape element mapping and radial layout, then migrate the viewer and preserve persisted layout override and adaptive focus behavior.

**Tech Stack:** React, TypeScript, Cytoscape.js, existing DeepTutor graph APIs, Node test runner, existing web test suite

---

## File Structure

### Graph rendering and mapping

- Create: `web/components/graph/CytoscapeGraphCanvas.tsx`
  - Own the Cytoscape instance, stylesheet, event wiring, pan/zoom, node click, node drag, and fit/reset behavior.
- Create: `web/lib/cytoscape-knowledge-graph.ts`
  - Convert `CourseKnowledgeGraph` plus adaptive UI state into Cytoscape elements and semantic classes.
- Create: `web/lib/cytoscape-knowledge-graph-layout.ts`
  - Build radial backbone layout, expanded lesson cluster layout, and apply persisted overrides.
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - Replace `ReactFlow` rendering with `CytoscapeGraphCanvas` while keeping existing data loading, recommendation, remediation, QA, and timeline orchestration.

### Graph contracts and persistence

- Modify: `web/lib/course-knowledge-graph.ts`
  - Strip out React Flow-specific shaping and expose graph contracts shared by both the viewer and Cytoscape mapper.
- Modify: `web/lib/knowledge-graph-state.ts`
  - Persist Cytoscape layout overrides and expanded lesson cluster ids with graph-version-safe keys.

### Tests

- Create: `web/tests/cytoscape-knowledge-graph.test.ts`
  - Cover Cytoscape element mapping and semantic class generation.
- Create: `web/tests/cytoscape-knowledge-graph-layout.test.ts`
  - Cover backbone radial layout, expanded cluster placement, and override application.
- Create: `web/tests/cytoscape-knowledge-graph-visibility.test.ts`
  - Cover backbone-only vs expanded visibility decisions.
- Modify: `web/tests/course-knowledge-graph.test.ts`
  - Remove React Flow-specific assumptions and keep shared contract coverage.
- Modify: `web/tests/knowledge-graph-actions.test.ts`
  - Keep recommendation/remediation focus actions compatible after renderer migration.
- Modify: `web/tests/graph-recommendation-ui.test.ts`
  - Ensure recommendation UI still targets node ids the new viewer can focus.

## Task 1: Add Cytoscape Dependencies And Shared Graph Contracts

**Files:**
- Modify: `web/package.json`
- Modify: `web/lib/course-knowledge-graph.ts`
- Modify: `web/tests/course-knowledge-graph.test.ts`

- [ ] **Step 1: Write the failing shared-contract test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKnowledgeGraphVisibilityState,
  type CourseKnowledgeGraph,
} from "../lib/course-knowledge-graph.ts";

test("buildKnowledgeGraphVisibilityState exposes backbone and expanded lesson ids", () => {
  const graph: CourseKnowledgeGraph = {
    course_id: "oop-java",
    title: "OOP Java",
    source_type: "syllabus_pdf",
    nodes: [
      { node_id: "lesson-1", title: "Bài 1", node_type: "lesson", hierarchy_level: 0 },
      { node_id: "subtopic-1-1", title: "1.1", node_type: "subtopic", hierarchy_level: 1, parent_node_id: "lesson-1" },
    ],
    edges: [],
    audit: {
      backbone_node_ids: ["lesson-1"],
      enriched_node_ids: ["subtopic-1-1"],
      backbone_edge_ids: [],
      enriched_edge_ids: [],
      warnings: [],
    },
  };

  const state = buildKnowledgeGraphVisibilityState(graph, ["lesson-1"]);

  assert.deepEqual(state.backboneNodeIds, ["lesson-1"]);
  assert.deepEqual(state.visibleExpandedParentIds, ["lesson-1"]);
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts`

Expected: FAIL because `buildKnowledgeGraphVisibilityState` does not exist yet.

- [ ] **Step 3: Add Cytoscape dependency and shared visibility contract**

```json
// web/package.json
{
  "dependencies": {
    "cytoscape": "^3.33.1"
  }
}
```

```ts
// web/lib/course-knowledge-graph.ts
export interface KnowledgeGraphVisibilityState {
  backboneNodeIds: string[];
  visibleExpandedParentIds: string[];
}

export function buildKnowledgeGraphVisibilityState(
  graph: CourseKnowledgeGraph,
  expandedLessonIds: string[],
): KnowledgeGraphVisibilityState {
  const backboneNodeIds = graph.nodes
    .filter((node) => (node.hierarchy_level ?? 0) === 0)
    .map((node) => String(node.node_id ?? ""))
    .filter(Boolean);

  const allowedParents = new Set(backboneNodeIds);
  return {
    backboneNodeIds,
    visibleExpandedParentIds: expandedLessonIds.filter((id) => allowedParents.has(id)),
  };
}
```

- [ ] **Step 4: Run the shared-contract test to verify it passes**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the dependency and contract update**

```bash
git add web/package.json web/lib/course-knowledge-graph.ts web/tests/course-knowledge-graph.test.ts
git commit -m "feat: add shared cytoscape graph contracts"
```

## Task 2: Add Cytoscape Element Mapping

**Files:**
- Create: `web/lib/cytoscape-knowledge-graph.ts`
- Create: `web/tests/cytoscape-knowledge-graph.test.ts`

- [ ] **Step 1: Write the failing Cytoscape mapper test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { mapCourseKnowledgeGraphToCytoscape } from "../lib/cytoscape-knowledge-graph.ts";

test("mapCourseKnowledgeGraphToCytoscape emits semantic lesson and subtopic nodes", () => {
  const result = mapCourseKnowledgeGraphToCytoscape(
    {
      course_id: "oop-java",
      title: "OOP Java",
      source_type: "syllabus_pdf",
      nodes: [
        { node_id: "lesson-1", title: "Bài 1", node_type: "lesson", hierarchy_level: 0 },
        { node_id: "subtopic-1-1", title: "1.1", node_type: "subtopic", hierarchy_level: 1, parent_node_id: "lesson-1" },
      ],
      edges: [
        { edge_id: "contains-1-1", source: "lesson-1", target: "subtopic-1-1", relation_type: "contains" },
      ],
      audit: {
        backbone_node_ids: ["lesson-1"],
        enriched_node_ids: ["subtopic-1-1"],
        backbone_edge_ids: [],
        enriched_edge_ids: ["contains-1-1"],
        warnings: [],
      },
    },
    {
      expandedLessonIds: ["lesson-1"],
      currentNodeId: "lesson-1",
      recommendedNodeId: "subtopic-1-1",
      progressMap: { "lesson-1": "mastered" },
      issuesByNodeId: {},
      remediationState: null,
    },
  );

  const lesson = result.nodes.find((node) => node.data.id === "lesson-1");
  const subtopic = result.nodes.find((node) => node.data.id === "subtopic-1-1");
  const containsEdge = result.edges.find((edge) => edge.data.id === "contains-1-1");

  assert.equal(lesson?.classes.includes("kind-lesson"), true);
  assert.equal(subtopic?.classes.includes("is-recommended"), true);
  assert.equal(containsEdge?.classes.includes("relation-contains"), true);
});
```

- [ ] **Step 2: Run the Cytoscape mapper test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/cytoscape-knowledge-graph.test.ts`

Expected: FAIL because `mapCourseKnowledgeGraphToCytoscape` does not exist yet.

- [ ] **Step 3: Write the minimal Cytoscape mapper**

```ts
// web/lib/cytoscape-knowledge-graph.ts
import type {
  CourseKnowledgeGraph,
  CourseKnowledgeGraphNodeIssue,
} from "./course-knowledge-graph.ts";

export interface CytoscapeNodeElement {
  data: Record<string, unknown>;
  classes: string;
}

export interface CytoscapeEdgeElement {
  data: Record<string, unknown>;
  classes: string;
}

export function mapCourseKnowledgeGraphToCytoscape(
  graph: CourseKnowledgeGraph,
  options: {
    expandedLessonIds: string[];
    currentNodeId?: string | null;
    recommendedNodeId?: string | null;
    progressMap?: Record<string, "explored" | "mastered">;
    issuesByNodeId?: Record<string, CourseKnowledgeGraphNodeIssue[]>;
    remediationState?: { sourceNodeId: string; targetNodeId: string; status: string } | null;
  },
): { nodes: CytoscapeNodeElement[]; edges: CytoscapeEdgeElement[] } {
  const expanded = new Set(options.expandedLessonIds);
  const nodes = graph.nodes.map((node) => {
    const id = String(node.node_id ?? "");
    const classes = [
      `kind-${node.node_type}`,
      (node.hierarchy_level ?? 0) === 0 ? "level-backbone" : "level-child",
      options.currentNodeId === id ? "is-current" : "",
      options.recommendedNodeId === id ? "is-recommended" : "",
      expanded.has(id) ? "is-expanded" : "",
      options.remediationState?.targetNodeId === id ? "is-remediation-target" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      data: {
        id,
        label: node.title,
        kind: node.node_type,
        parentId: node.parent_node_id ?? "",
        hierarchyLevel: node.hierarchy_level ?? 0,
      },
      classes,
    };
  });

  const edges = graph.edges.map((edge) => ({
    data: {
      id: String(edge.edge_id ?? `${edge.source}-${edge.target}`),
      source: edge.source,
      target: edge.target,
      relationType: edge.relation_type,
    },
    classes: `relation-${edge.relation_type}`,
  }));

  return { nodes, edges };
}
```

- [ ] **Step 4: Run the Cytoscape mapper test to verify it passes**

Run: `node --experimental-strip-types --test web/tests/cytoscape-knowledge-graph.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the Cytoscape mapper**

```bash
git add web/lib/cytoscape-knowledge-graph.ts web/tests/cytoscape-knowledge-graph.test.ts
git commit -m "feat: add cytoscape graph mapper"
```

## Task 3: Add Backbone And Cluster Layout Helpers

**Files:**
- Create: `web/lib/cytoscape-knowledge-graph-layout.ts`
- Create: `web/tests/cytoscape-knowledge-graph-layout.test.ts`
- Create: `web/tests/cytoscape-knowledge-graph-visibility.test.ts`

- [ ] **Step 1: Write the failing layout test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBackboneRadialLayout,
  buildExpandedClusterLayout,
} from "../lib/cytoscape-knowledge-graph-layout.ts";

test("buildBackboneRadialLayout spreads lesson nodes instead of keeping one x-column", () => {
  const positions = buildBackboneRadialLayout(["lesson-1", "lesson-2", "lesson-3"], {
    centerX: 400,
    centerY: 300,
    radius: 220,
  });

  assert.notEqual(positions["lesson-1"].x, positions["lesson-2"].x);
  assert.notEqual(positions["lesson-2"].y, positions["lesson-3"].y);
});

test("buildExpandedClusterLayout positions subtopics around a lesson hub", () => {
  const positions = buildExpandedClusterLayout("lesson-3", ["subtopic-3-1", "subtopic-3-2"], {
    parent: { x: 500, y: 500 },
    radius: 160,
  });

  assert.equal(Object.keys(positions).length, 2);
  assert.notDeepEqual(positions["subtopic-3-1"], positions["subtopic-3-2"]);
});
```

- [ ] **Step 2: Run the layout tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/cytoscape-knowledge-graph-layout.test.ts`

Expected: FAIL because the new layout helpers do not exist yet.

- [ ] **Step 3: Add radial backbone and cluster helpers**

```ts
// web/lib/cytoscape-knowledge-graph-layout.ts
export interface CytoscapeGraphPoint {
  x: number;
  y: number;
}

export function buildBackboneRadialLayout(
  nodeIds: string[],
  options: { centerX: number; centerY: number; radius: number },
): Record<string, CytoscapeGraphPoint> {
  const result: Record<string, CytoscapeGraphPoint> = {};
  nodeIds.forEach((id, index) => {
    const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(nodeIds.length, 1);
    result[id] = {
      x: Math.round(options.centerX + Math.cos(angle) * options.radius),
      y: Math.round(options.centerY + Math.sin(angle) * options.radius),
    };
  });
  return result;
}

export function buildExpandedClusterLayout(
  _parentId: string,
  childIds: string[],
  options: { parent: CytoscapeGraphPoint; radius: number },
): Record<string, CytoscapeGraphPoint> {
  const result: Record<string, CytoscapeGraphPoint> = {};
  childIds.forEach((id, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(childIds.length, 1);
    result[id] = {
      x: Math.round(options.parent.x + Math.cos(angle) * options.radius),
      y: Math.round(options.parent.y + Math.sin(angle) * options.radius),
    };
  });
  return result;
}

export function applyCytoscapeLayoutOverrides(
  base: Record<string, CytoscapeGraphPoint>,
  overrides: Record<string, CytoscapeGraphPoint>,
): Record<string, CytoscapeGraphPoint> {
  return { ...base, ...overrides };
}
```

- [ ] **Step 4: Add the failing visibility test and minimal visibility helper**

```ts
// web/tests/cytoscape-knowledge-graph-visibility.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { filterVisibleCytoscapeNodeIds } from "../lib/cytoscape-knowledge-graph-layout.ts";

test("filterVisibleCytoscapeNodeIds keeps only backbone nodes until a lesson is expanded", () => {
  const visible = filterVisibleCytoscapeNodeIds(
    [
      { id: "lesson-1", parentId: "", hierarchyLevel: 0 },
      { id: "subtopic-1-1", parentId: "lesson-1", hierarchyLevel: 1 },
    ],
    ["lesson-1"],
  );

  assert.deepEqual(visible.sort(), ["lesson-1", "subtopic-1-1"]);
});
```

```ts
// web/lib/cytoscape-knowledge-graph-layout.ts
export function filterVisibleCytoscapeNodeIds(
  nodes: Array<{ id: string; parentId: string; hierarchyLevel: number }>,
  expandedLessonIds: string[],
): string[] {
  const expanded = new Set(expandedLessonIds);
  return nodes
    .filter((node) => node.hierarchyLevel === 0 || expanded.has(node.parentId))
    .map((node) => node.id);
}
```

- [ ] **Step 5: Run layout and visibility tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/cytoscape-knowledge-graph-layout.test.ts web/tests/cytoscape-knowledge-graph-visibility.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the layout helpers**

```bash
git add web/lib/cytoscape-knowledge-graph-layout.ts web/tests/cytoscape-knowledge-graph-layout.test.ts web/tests/cytoscape-knowledge-graph-visibility.test.ts
git commit -m "feat: add cytoscape radial layout helpers"
```

## Task 4: Create CytoscapeGraphCanvas

**Files:**
- Create: `web/components/graph/CytoscapeGraphCanvas.tsx`
- Modify: `web/tests/knowledge-graph-actions.test.ts`

- [ ] **Step 1: Write the failing canvas interaction test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { createCytoscapeStylesheet } from "../components/graph/CytoscapeGraphCanvas.tsx";

test("createCytoscapeStylesheet differentiates prerequisite and contains edges", () => {
  const stylesheet = createCytoscapeStylesheet();
  const containsRule = stylesheet.find((rule) => rule.selector === "edge.relation-contains");
  const prerequisiteRule = stylesheet.find((rule) => rule.selector === "edge.relation-prerequisite");

  assert.ok(containsRule);
  assert.ok(prerequisiteRule);
  assert.notDeepEqual(containsRule?.style, prerequisiteRule?.style);
});
```

- [ ] **Step 2: Run the canvas interaction test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-actions.test.ts`

Expected: FAIL because `createCytoscapeStylesheet` does not exist yet.

- [ ] **Step 3: Create the Cytoscape canvas with explicit semantic styling**

```tsx
// web/components/graph/CytoscapeGraphCanvas.tsx
import React, { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type StylesheetStyle } from "cytoscape";

export function createCytoscapeStylesheet(): Array<{ selector: string; style: StylesheetStyle }> {
  return [
    {
      selector: "node.kind-lesson",
      style: {
        label: "data(label)",
        "background-color": "#dcfce7",
        "border-color": "#16a34a",
        "border-width": 3,
        width: 120,
        height: 120,
        "text-wrap": "wrap",
        "text-max-width": 96,
        "font-size": 15,
      },
    },
    {
      selector: "node.kind-subtopic",
      style: {
        label: "data(label)",
        "background-color": "#eff6ff",
        "border-color": "#2563eb",
        "border-width": 2,
        width: 86,
        height: 86,
        "text-wrap": "wrap",
        "text-max-width": 72,
        "font-size": 12,
      },
    },
    {
      selector: "edge.relation-prerequisite",
      style: {
        width: 3,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    {
      selector: "edge.relation-contains",
      style: {
        width: 1.5,
        "line-color": "#cbd5e1",
        "target-arrow-shape": "none",
        "curve-style": "haystack",
      },
    },
  ];
}

export function CytoscapeGraphCanvas(props: {
  elements: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
  onNodeSelect?: (nodeId: string) => void;
  onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const stylesheet = useMemo(() => createCytoscapeStylesheet(), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [...props.elements.nodes, ...props.elements.edges],
      layout: { name: "preset" },
      style: stylesheet,
    });
    cy.on("tap", "node", (event) => {
      props.onNodeSelect?.(String(event.target.id()));
    });
    cy.on("dragfree", "node", (event) => {
      const position = event.target.position();
      props.onNodeDragStop?.(String(event.target.id()), { x: position.x, y: position.y });
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [props, stylesheet]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

- [ ] **Step 4: Run the canvas interaction test to verify it passes**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-actions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the Cytoscape canvas**

```bash
git add web/components/graph/CytoscapeGraphCanvas.tsx web/tests/knowledge-graph-actions.test.ts
git commit -m "feat: add cytoscape graph canvas"
```

## Task 5: Migrate KnowledgeGraphViewer To Cytoscape

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/lib/knowledge-graph-state.ts`
- Modify: `web/tests/graph-recommendation-ui.test.ts`

- [ ] **Step 1: Write the failing viewer migration test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  readStoredKnowledgeGraphState,
  writeStoredKnowledgeGraphState,
} from "../lib/knowledge-graph-state.ts";

test("knowledge graph state persists expanded lesson ids and layout overrides for Cytoscape", () => {
  writeStoredKnowledgeGraphState("oop-java", {
    currentNodeId: "lesson-1",
    dynamicNodes: [],
    expandedClusterIds: ["lesson-1"],
    layoutOverrides: {
      "lesson-1": { x: 420, y: 380 },
    },
  });

  const restored = readStoredKnowledgeGraphState("oop-java");
  assert.deepEqual(restored.expandedClusterIds, ["lesson-1"]);
  assert.deepEqual(restored.layoutOverrides["lesson-1"], { x: 420, y: 380 });
});
```

- [ ] **Step 2: Run the viewer migration test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/graph-recommendation-ui.test.ts`

Expected: FAIL if persistence assumptions no longer line up with the viewer migration scaffolding.

- [ ] **Step 3: Replace React Flow rendering with CytoscapeGraphCanvas**

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx
import { CytoscapeGraphCanvas } from "./CytoscapeGraphCanvas";
import { mapCourseKnowledgeGraphToCytoscape } from "@/lib/cytoscape-knowledge-graph";
import {
  applyCytoscapeLayoutOverrides,
  buildBackboneRadialLayout,
  buildExpandedClusterLayout,
  filterVisibleCytoscapeNodeIds,
} from "@/lib/cytoscape-knowledge-graph-layout";

// inside applyCourseTemplate replacement logic
const cytoscapeGraph = mapCourseKnowledgeGraphToCytoscape(templateGraph, {
  expandedLessonIds: expandedClusterIds,
  currentNodeId,
  recommendedNodeId: recommendation?.recommended_node_id ?? null,
  progressMap,
  issuesByNodeId: buildIssuesByNodeId(qaReport),
  remediationState: activeRemediation
    ? {
        sourceNodeId: activeRemediation.source_node_id,
        targetNodeId: activeRemediation.target_node_id,
        status: activeRemediation.status,
      }
    : null,
});

const visibleNodeIds = filterVisibleCytoscapeNodeIds(
  cytoscapeGraph.nodes.map((node) => ({
    id: String(node.data.id),
    parentId: String(node.data.parentId ?? ""),
    hierarchyLevel: Number(node.data.hierarchyLevel ?? 0),
  })),
  expandedClusterIds,
);

return (
  <CytoscapeGraphCanvas
    elements={{
      nodes: cytoscapeGraph.nodes.filter((node) => visibleNodeIds.includes(String(node.data.id))),
      edges: cytoscapeGraph.edges.filter((edge) => {
        const source = String(edge.data.source);
        const target = String(edge.data.target);
        return visibleNodeIds.includes(source) && visibleNodeIds.includes(target);
      }),
    }}
    onNodeSelect={(nodeId) => selectNodeById(nodeId)}
    onNodeDragStop={(nodeId, position) => {
      setLayoutOverrides((prev) => {
        const next = { ...prev, [nodeId]: position };
        persistRuntimeState(currentNodeId, dynamicNodes, expandedClusterIds, next);
        return next;
      });
    }}
  />
);
```

- [ ] **Step 4: Keep persisted state stable for the Cytoscape viewer**

```ts
// web/lib/knowledge-graph-state.ts
export interface StoredKnowledgeGraphState {
  currentNodeId: string;
  dynamicNodes: Array<Record<string, unknown>>;
  expandedClusterIds: string[];
  layoutOverrides: Record<string, { x: number; y: number }>;
}
```

- [ ] **Step 5: Run the focused web tests to verify the migration passes**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph-layout.test.ts web/tests/cytoscape-knowledge-graph-visibility.test.ts web/tests/graph-recommendation-ui.test.ts web/tests/knowledge-graph-actions.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the viewer migration**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx web/lib/knowledge-graph-state.ts web/tests/graph-recommendation-ui.test.ts
git add web/lib/cytoscape-knowledge-graph.ts web/lib/cytoscape-knowledge-graph-layout.ts web/components/graph/CytoscapeGraphCanvas.tsx
git commit -m "feat: migrate knowledge graph viewer to cytoscape"
```

## Task 6: Preserve Adaptive Focus, QA, And Timeline Flows

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/tests/knowledge-graph-actions.test.ts`
- Modify: `web/tests/graph-recommendation-ui.test.ts`

- [ ] **Step 1: Write the failing adaptive focus regression test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { resolveExpandedLessonIdsForFocus } from "../lib/cytoscape-knowledge-graph.ts";

test("resolveExpandedLessonIdsForFocus opens the parent lesson when focusing a subtopic", () => {
  const expanded = resolveExpandedLessonIdsForFocus(
    { "subtopic-3-2": "lesson-3" },
    [],
    "subtopic-3-2",
  );

  assert.deepEqual(expanded, ["lesson-3"]);
});
```

- [ ] **Step 2: Run the adaptive focus test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-actions.test.ts web/tests/graph-recommendation-ui.test.ts`

Expected: FAIL because parent-cluster auto-expansion for focus does not exist yet.

- [ ] **Step 3: Add parent-cluster expansion when recommendation, review, remediation, or timeline focuses a child**

```ts
// web/lib/cytoscape-knowledge-graph.ts
export function resolveExpandedLessonIdsForFocus(
  parentByNodeId: Record<string, string>,
  expandedLessonIds: string[],
  focusNodeId: string,
): string[] {
  const parentId = parentByNodeId[focusNodeId];
  if (!parentId || expandedLessonIds.includes(parentId)) return expandedLessonIds;
  return [...expandedLessonIds, parentId];
}
```

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx
const ensureFocusVisible = useCallback((nodeId: string) => {
  setExpandedClusterIds((prev) => {
    const next = resolveExpandedLessonIdsForFocus(parentByNodeId, prev, nodeId);
    if (next === prev) return prev;
    persistRuntimeState(currentNodeId, dynamicNodes, next, layoutOverrides);
    return next;
  });
}, [currentNodeId, dynamicNodes, layoutOverrides, parentByNodeId, persistRuntimeState]);

// call ensureFocusVisible(...) inside:
// - selectNodeById
// - recommendation jump
// - timeline focus actions
// - remediation/review target focus
```

- [ ] **Step 4: Run the adaptive regression tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-actions.test.ts web/tests/graph-recommendation-ui.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the adaptive compatibility fix**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx web/tests/knowledge-graph-actions.test.ts web/tests/graph-recommendation-ui.test.ts
git commit -m "feat: preserve adaptive graph focus in cytoscape viewer"
```

## Task 7: Final Verification

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/CytoscapeGraphCanvas.tsx`
- Modify: `web/lib/cytoscape-knowledge-graph.ts`
- Modify: `web/lib/cytoscape-knowledge-graph-layout.ts`
- Modify: `web/lib/course-knowledge-graph.ts`
- Modify: `web/lib/knowledge-graph-state.ts`
- Test: `web/tests/course-knowledge-graph.test.ts`
- Test: `web/tests/cytoscape-knowledge-graph.test.ts`
- Test: `web/tests/cytoscape-knowledge-graph-layout.test.ts`
- Test: `web/tests/cytoscape-knowledge-graph-visibility.test.ts`
- Test: `web/tests/knowledge-graph-actions.test.ts`
- Test: `web/tests/graph-recommendation-ui.test.ts`
- Test: `web/tests/graph-review-state.test.ts`

- [ ] **Step 1: Run the full focused web verification suite**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph-layout.test.ts web/tests/cytoscape-knowledge-graph-visibility.test.ts web/tests/knowledge-graph-actions.test.ts web/tests/graph-recommendation-ui.test.ts web/tests/graph-review-state.test.ts`

Expected: PASS

- [ ] **Step 2: Manually verify the Cytoscape graph in the browser**

Run: `cd web && npm run dev`

Expected manual checks:
- imported syllabus no longer appears as a single vertical React Flow column
- lesson nodes are arranged as a radial backbone
- clicking a lesson expands a readable subtopic cluster
- dragging a node adjusts its position and persists after refresh
- recommendation and remediation focus reveal the correct cluster
- reset layout returns the graph to auto-layout

- [ ] **Step 3: Commit the final verification state**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/CytoscapeGraphCanvas.tsx
git add web/lib/cytoscape-knowledge-graph.ts web/lib/cytoscape-knowledge-graph-layout.ts
git add web/lib/course-knowledge-graph.ts web/lib/knowledge-graph-state.ts
git add web/tests/course-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph.test.ts
git add web/tests/cytoscape-knowledge-graph-layout.test.ts web/tests/cytoscape-knowledge-graph-visibility.test.ts
git add web/tests/knowledge-graph-actions.test.ts web/tests/graph-recommendation-ui.test.ts web/tests/graph-review-state.test.ts
git commit -m "test: verify cytoscape knowledge graph migration"
```

