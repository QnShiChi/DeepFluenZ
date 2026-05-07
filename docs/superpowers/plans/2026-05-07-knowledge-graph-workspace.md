# Knowledge Graph Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the knowledge-graph screen into a graph-first workspace with an always-visible overview graph, an in-graph focus inset, and a contextual tutor rail that expands only during action-heavy flows.

**Architecture:** Keep Cytoscape as the renderer for both graph surfaces, but split responsibilities cleanly: `KnowledgeGraphViewer` remains the orchestration boundary, a new workspace shell owns the 65/35 layout, the overview graph stays course-wide, and a second scoped Cytoscape surface renders the selected cluster inside the graph zone. Context-rail state stays explicit at the screen level so chat and quiz actions can widen the rail without displacing the graph-first layout.

**Tech Stack:** React, TypeScript, Cytoscape.js, Tailwind CSS, existing DeepTutor graph helpers, Node test runner (`node --experimental-strip-types --test`)

---

## File Structure

### Workspace state and screen layout

- Create: `web/lib/knowledge-graph-workspace.ts`
  - Centralize workspace-only state helpers for rail mode, focus visibility, and desktop/mobile layout decisions.
- Create: `web/components/graph/KnowledgeGraphWorkspaceShell.tsx`
  - Render the graph zone, inset slot, and contextual rail with the required graph-first width balance.
- Create: `web/components/graph/KnowledgeGraphContextRail.tsx`
  - Replace the current floating detail-panel behavior with an inline rail that supports slim and expanded states.

### Graph surfaces

- Create: `web/components/graph/KnowledgeGraphFocusInset.tsx`
  - Render the scoped focus graph inside the graph zone with clear actions for ask-tutor, open detail, start quiz, pin, and clear focus.
- Modify: `web/components/graph/CytoscapeGraphCanvas.tsx`
  - Support graph-surface variants so overview and inset can reuse the renderer with different fit and focus rules.
- Modify: `web/lib/cytoscape-graph-styles.ts`
  - Add surface-aware style rules for overview versus focus detail.

### Graph data and layout helpers

- Modify: `web/lib/cytoscape-knowledge-graph.ts`
  - Add scoped-subgraph helpers and surface metadata without changing the course schema.
- Modify: `web/lib/cytoscape-knowledge-graph-layout.ts`
  - Add layout helpers for the focus inset so local clusters render at readable scale.

### Viewer orchestration

- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - Move the screen from a single full-canvas overlay model to the new workspace shell and coordinate the two graph surfaces plus contextual rail.
- Modify: `web/components/graph/NodeDetailPanel.tsx`
  - Convert absolute overlay assumptions into an embeddable panel body used inside the rail.

### Tests

- Create: `web/tests/knowledge-graph-workspace.test.ts`
  - Source-level coverage for the new workspace shell, graph/rail ratio classes, and inset placement.
- Modify: `web/tests/knowledge-graph-viewer-renderer.test.ts`
  - Verify `KnowledgeGraphViewer` renders both graph surfaces and forwards rail/inset props.
- Modify: `web/tests/knowledge-graph-viewer-clusters.test.ts`
  - Verify cluster clicks open the inset without replacing the overview.
- Modify: `web/tests/cytoscape-knowledge-graph.test.ts`
  - Verify focus-subgraph selection keeps cluster and relation semantics consistent.
- Modify: `web/tests/cytoscape-knowledge-graph-layout.test.ts`
  - Verify focus-inset layout helpers keep local detail readable.
- Modify: `web/tests/knowledge-graph-actions.test.ts`
  - Verify chat and quiz actions switch the contextual rail into expanded action mode.

## Task 1: Add Workspace State Helpers And Shell Contracts

**Files:**
- Create: `web/lib/knowledge-graph-workspace.ts`
- Create: `web/tests/knowledge-graph-workspace.test.ts`

- [ ] **Step 1: Write the failing workspace helper test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceState,
  resolveRailModeAfterAction,
} from "../lib/knowledge-graph-workspace.ts";

test("buildWorkspaceState keeps overview visible while opening a focused cluster", () => {
  const state = buildWorkspaceState({
    activeClusterId: "lesson-4",
    selectedNodeId: "lesson-4",
    railMode: "summary",
  });

  assert.equal(state.showOverviewGraph, true);
  assert.equal(state.showFocusInset, true);
  assert.equal(state.focusClusterId, "lesson-4");
  assert.equal(state.railMode, "summary");
});

test("resolveRailModeAfterAction widens the rail only for action-heavy flows", () => {
  assert.equal(resolveRailModeAfterAction("idle", "summary"), "summary");
  assert.equal(resolveRailModeAfterAction("chat", "summary"), "chat");
  assert.equal(resolveRailModeAfterAction("quiz", "summary"), "quiz");
  assert.equal(resolveRailModeAfterAction("close-action", "quiz"), "summary");
});
```

- [ ] **Step 2: Run the workspace helper test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-workspace.test.ts`
Expected: FAIL because `knowledge-graph-workspace.ts` does not exist yet.

- [ ] **Step 3: Add the workspace-state helper module**

```ts
// web/lib/knowledge-graph-workspace.ts
export type KnowledgeGraphRailMode = "summary" | "chat" | "quiz";
export type KnowledgeGraphRailAction = "idle" | "chat" | "quiz" | "close-action";

export interface KnowledgeGraphWorkspaceState {
  showOverviewGraph: boolean;
  showFocusInset: boolean;
  focusClusterId: string | null;
  railMode: KnowledgeGraphRailMode;
}

export function buildWorkspaceState(input: {
  activeClusterId: string | null;
  selectedNodeId: string | null;
  railMode: KnowledgeGraphRailMode;
}): KnowledgeGraphWorkspaceState {
  const focusClusterId = input.activeClusterId ?? input.selectedNodeId ?? null;

  return {
    showOverviewGraph: true,
    showFocusInset: focusClusterId !== null,
    focusClusterId,
    railMode: input.railMode,
  };
}

export function resolveRailModeAfterAction(
  action: KnowledgeGraphRailAction,
  currentMode: KnowledgeGraphRailMode,
): KnowledgeGraphRailMode {
  if (action === "chat") return "chat";
  if (action === "quiz") return "quiz";
  if (action === "close-action") return "summary";
  return currentMode;
}
```

- [ ] **Step 4: Create the workspace-shell source test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/graph/KnowledgeGraphWorkspaceShell.tsx", import.meta.url),
  "utf8",
);

test("KnowledgeGraphWorkspaceShell renders graph-first layout zones", () => {
  assert.match(source, /grid-cols-\[minmax\(0,1\.85fr\)_minmax\(320px,1fr\)\]/);
  assert.match(source, /overviewSlot/);
  assert.match(source, /focusInsetSlot/);
  assert.match(source, /railSlot/);
});
```

- [ ] **Step 5: Add the workspace shell component**

```tsx
// web/components/graph/KnowledgeGraphWorkspaceShell.tsx
import React from "react";

export default function KnowledgeGraphWorkspaceShell({
  overviewSlot,
  focusInsetSlot,
  railSlot,
}: {
  overviewSlot: React.ReactNode;
  focusInsetSlot: React.ReactNode;
  railSlot: React.ReactNode;
}) {
  return (
    <section className="grid h-full min-h-[720px] gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
      <div className="relative min-h-[720px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950">
        {overviewSlot}
        <div className="pointer-events-none absolute inset-x-4 bottom-4 top-4 flex justify-end">
          <div className="pointer-events-auto w-full max-w-[420px] self-end lg:self-start">
            {focusInsetSlot}
          </div>
        </div>
      </div>
      <aside className="min-h-[720px] rounded-[28px] border border-slate-200 bg-white">
        {railSlot}
      </aside>
    </section>
  );
}
```

- [ ] **Step 6: Run the workspace tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-workspace.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the workspace helper and shell contract**

```bash
git add web/lib/knowledge-graph-workspace.ts web/components/graph/KnowledgeGraphWorkspaceShell.tsx web/tests/knowledge-graph-workspace.test.ts
git commit -m "feat: add knowledge graph workspace shell"
```

## Task 2: Add Focus-Subgraph Mapping And Readable Inset Layout

**Files:**
- Modify: `web/lib/cytoscape-knowledge-graph.ts`
- Modify: `web/lib/cytoscape-knowledge-graph-layout.ts`
- Modify: `web/tests/cytoscape-knowledge-graph.test.ts`
- Modify: `web/tests/cytoscape-knowledge-graph-layout.test.ts`

- [ ] **Step 1: Write the failing focus-subgraph mapper test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildFocusedCytoscapeSubgraph } from "../lib/cytoscape-knowledge-graph.ts";

test("buildFocusedCytoscapeSubgraph keeps the selected cluster and its local relations", () => {
  const focused = buildFocusedCytoscapeSubgraph(
    {
      nodes: [
        { data: { id: "lesson-2", parentId: "", hierarchyLevel: 0 } },
        { data: { id: "subtopic-2-1", parentId: "lesson-2", hierarchyLevel: 1 } },
        { data: { id: "lesson-3", parentId: "", hierarchyLevel: 0 } },
      ],
      edges: [
        { data: { id: "contains-2-1", source: "lesson-2", target: "subtopic-2-1", relationType: "contains" } },
      ],
    } as any,
    "lesson-2",
  );

  assert.deepEqual(focused.nodes.map((node) => node.data.id), ["lesson-2", "subtopic-2-1"]);
  assert.deepEqual(focused.edges.map((edge) => edge.data.id), ["contains-2-1"]);
});
```

- [ ] **Step 2: Run the mapper/layout tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/cytoscape-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph-layout.test.ts`
Expected: FAIL because `buildFocusedCytoscapeSubgraph` and the inset layout helper do not exist yet.

- [ ] **Step 3: Add the focused-subgraph helper**

```ts
// web/lib/cytoscape-knowledge-graph.ts
export function buildFocusedCytoscapeSubgraph(
  graph: { nodes: CytoscapeNodeElement[]; edges: CytoscapeEdgeElement[] },
  focusClusterId: string,
): { nodes: CytoscapeNodeElement[]; edges: CytoscapeEdgeElement[] } {
  const visibleNodeIds = new Set(
    graph.nodes
      .filter((node) => node.data.id === focusClusterId || node.data.parentId === focusClusterId)
      .map((node) => node.data.id),
  );

  return {
    nodes: graph.nodes.filter((node) => visibleNodeIds.has(node.data.id)),
    edges: graph.edges.filter((edge) => visibleNodeIds.has(edge.data.source) && visibleNodeIds.has(edge.data.target)),
  };
}
```

- [ ] **Step 4: Add the failing inset-layout test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildFocusInsetLayout } from "../lib/cytoscape-knowledge-graph-layout.ts";

test("buildFocusInsetLayout gives the cluster hub centered space and readable child radius", () => {
  const positions = buildFocusInsetLayout("lesson-2", ["subtopic-2-1", "subtopic-2-2", "subtopic-2-3"]);

  assert.deepEqual(positions["lesson-2"], { x: 280, y: 220 });
  assert.ok(positions["subtopic-2-1"].x !== 280 || positions["subtopic-2-1"].y !== 220);
  assert.ok(Math.abs(positions["subtopic-2-1"].x - 280) >= 150);
});
```

- [ ] **Step 5: Add the focus-inset layout helper**

```ts
// web/lib/cytoscape-knowledge-graph-layout.ts
export function buildFocusInsetLayout(
  clusterId: string,
  childIds: string[],
): Record<string, CytoscapeGraphPoint> {
  const center = { x: 280, y: 220 };
  const radius = Math.max(156, 132 + childIds.length * 18);
  const result: Record<string, CytoscapeGraphPoint> = {
    [clusterId]: center,
  };

  childIds.forEach((childId, index) => {
    const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(childIds.length, 1);
    result[childId] = {
      x: Math.round(center.x + Math.cos(angle) * radius),
      y: Math.round(center.y + Math.sin(angle) * radius),
    };
  });

  return result;
}
```

- [ ] **Step 6: Run the mapper/layout tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/cytoscape-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph-layout.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the focus-subgraph and inset-layout helpers**

```bash
git add web/lib/cytoscape-knowledge-graph.ts web/lib/cytoscape-knowledge-graph-layout.ts web/tests/cytoscape-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph-layout.test.ts
git commit -m "feat: add focused knowledge graph inset helpers"
```

## Task 3: Make The Cytoscape Renderer Surface-Aware And Add The Focus Inset Component

**Files:**
- Create: `web/components/graph/KnowledgeGraphFocusInset.tsx`
- Modify: `web/components/graph/CytoscapeGraphCanvas.tsx`
- Modify: `web/lib/cytoscape-graph-styles.ts`
- Modify: `web/tests/cytoscape-graph-canvas.test.ts`

- [ ] **Step 1: Write the failing renderer test for surface variants**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createCytoscapeStylesheet } from "../lib/cytoscape-graph-styles.ts";

const canvasSource = readFileSync(
  new URL("../components/graph/CytoscapeGraphCanvas.tsx", import.meta.url),
  "utf8",
);

test("createCytoscapeStylesheet defines focus-surface edge emphasis", () => {
  const stylesheet = createCytoscapeStylesheet("focus");
  const focusContainsRule = stylesheet.find((rule) => rule.selector === "edge.relation-contains");
  const focusPrereqRule = stylesheet.find((rule) => rule.selector === "edge.relation-prerequisite");

  assert.equal(focusContainsRule?.style.opacity, 0.42);
  assert.equal(focusPrereqRule?.style.width, 3.2);
});

test("CytoscapeGraphCanvas accepts a surface variant prop", () => {
  assert.match(canvasSource, /surfaceVariant\?: "overview" \| "focus"/);
  assert.match(canvasSource, /createCytoscapeStylesheet\(surfaceVariant\)/);
});
```

- [ ] **Step 2: Run the renderer test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/cytoscape-graph-canvas.test.ts`
Expected: FAIL because the stylesheet factory does not accept a surface variant and the canvas props do not expose it.

- [ ] **Step 3: Extend the stylesheet factory for overview and focus surfaces**

```ts
// web/lib/cytoscape-graph-styles.ts
export function createCytoscapeStylesheet(
  surfaceVariant: "overview" | "focus" = "overview",
): CytoscapeStylesheetRule[] {
  const isFocusSurface = surfaceVariant === "focus";

  return [
    {
      selector: "edge.relation-prerequisite",
      style: {
        width: isFocusSurface ? 3.2 : 2.4,
        opacity: isFocusSurface ? 0.82 : 0.56,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        "target-arrow-shape": "triangle",
      },
    },
    {
      selector: "edge.relation-contains",
      style: {
        width: isFocusSurface ? 1.8 : 1.2,
        opacity: isFocusSurface ? 0.42 : 0.22,
        "line-color": isFocusSurface ? "#94a3b8" : "#cbd5e1",
        "target-arrow-shape": "none",
      },
    },
  ];
}
```

- [ ] **Step 4: Add the surface variant to the Cytoscape canvas**

```tsx
// web/components/graph/CytoscapeGraphCanvas.tsx
export interface CytoscapeGraphCanvasProps {
  nodes: CytoscapeNodeElement[];
  edges: CytoscapeEdgeElement[];
  positions?: Record<string, CytoscapeGraphPoint>;
  surfaceVariant?: "overview" | "focus";
  className?: string;
  onNodeClick?: (nodeId: string) => void;
  onNodeDragStop?: (nodeId: string, position: CytoscapeGraphPoint) => void;
  onZoomTierChange?: (tier: "far" | "mid" | "near") => void;
  focusNodeId?: string | null;
  fitViewportVersion?: number;
}

export default function CytoscapeGraphCanvas({
  surfaceVariant = "overview",
  // ...existing props
}: CytoscapeGraphCanvasProps) {
  // ...
  const cy = cytoscape({
    container: containerRef.current,
    elements,
    style: createCytoscapeStylesheet(surfaceVariant),
    layout: { name: "preset" },
    ...createCytoscapeInteractionOptions(),
  });
  // ...
  cy.style(createCytoscapeStylesheet(surfaceVariant));
}
```

- [ ] **Step 5: Create the focus inset component**

```tsx
// web/components/graph/KnowledgeGraphFocusInset.tsx
import React from "react";
import CytoscapeGraphCanvas from "./CytoscapeGraphCanvas";
import type { CytoscapeEdgeElement, CytoscapeNodeElement } from "@/lib/cytoscape-knowledge-graph";
import type { CytoscapeGraphPoint } from "@/lib/cytoscape-knowledge-graph-layout";

export default function KnowledgeGraphFocusInset({
  title,
  nodes,
  edges,
  positions,
  onNodeClick,
  onOpenDetail,
  onAskAbout,
  onStartQuiz,
  onPinCluster,
  onClearFocus,
}: {
  title: string;
  nodes: CytoscapeNodeElement[];
  edges: CytoscapeEdgeElement[];
  positions: Record<string, CytoscapeGraphPoint>;
  onNodeClick: (nodeId: string) => void;
  onOpenDetail: () => void;
  onAskAbout: () => void;
  onStartQuiz: () => void;
  onPinCluster: () => void;
  onClearFocus: () => void;
}) {
  return (
    <section className="rounded-[24px] border border-white/15 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-300">Focused Cluster</div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <button onClick={onClearFocus} className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200">
          Clear
        </button>
      </div>
      <div className="h-[320px] overflow-hidden rounded-[18px] border border-white/10 bg-slate-900">
        <CytoscapeGraphCanvas
          nodes={nodes}
          edges={edges}
          positions={positions}
          onNodeClick={onNodeClick}
          surfaceVariant="focus"
          className="h-full min-h-[320px]"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onOpenDetail} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white">Open Detail</button>
        <button onClick={onAskAbout} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950">Ask Tutor</button>
        <button onClick={onStartQuiz} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white">Start Quiz</button>
        <button onClick={onPinCluster} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white">Pin</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the renderer test to verify it passes**

Run: `node --experimental-strip-types --test web/tests/cytoscape-graph-canvas.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the surface-aware renderer and focus inset**

```bash
git add web/components/graph/KnowledgeGraphFocusInset.tsx web/components/graph/CytoscapeGraphCanvas.tsx web/lib/cytoscape-graph-styles.ts web/tests/cytoscape-graph-canvas.test.ts
git commit -m "feat: add knowledge graph focus inset surface"
```

## Task 4: Move Node Detail Into A Contextual Rail With Slim And Expanded Modes

**Files:**
- Create: `web/components/graph/KnowledgeGraphContextRail.tsx`
- Modify: `web/components/graph/NodeDetailPanel.tsx`
- Modify: `web/tests/knowledge-graph-actions.test.ts`

- [ ] **Step 1: Write the failing rail-mode source test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/graph/KnowledgeGraphContextRail.tsx", import.meta.url),
  "utf8",
);

test("KnowledgeGraphContextRail supports summary and expanded action modes", () => {
  assert.match(source, /railMode: "summary" \| "chat" \| "quiz"/);
  assert.match(source, /railMode === "summary"/);
  assert.match(source, /railMode !== "summary"/);
});
```

- [ ] **Step 2: Run the rail-mode test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-actions.test.ts`
Expected: FAIL because `KnowledgeGraphContextRail.tsx` does not exist yet.

- [ ] **Step 3: Remove absolute overlay assumptions from the node detail panel**

```tsx
// web/components/graph/NodeDetailPanel.tsx
export default function NodeDetailPanel({
  node,
  progressStatus,
  recommendation,
  nextStepDecision,
  qaIssues = [],
  onApplyQaFix,
  onClose,
  onAskAbout,
  onQuizNode,
  onJumpToRecommended,
  onOpenTimeline,
  className,
  embedded = false,
}: NodeDetailPanelProps & { className?: string; embedded?: boolean }) {
  if (!node) return null;

  return (
    <div
      ref={panelRef}
      className={className ?? (embedded
        ? "flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white"
        : "absolute top-4 right-4 bottom-4 z-20 w-80 max-w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white shadow-xl")}
    >
      {/* existing body stays the same */}
    </div>
  );
}
```

- [ ] **Step 4: Add the contextual rail component**

```tsx
// web/components/graph/KnowledgeGraphContextRail.tsx
import React from "react";
import NodeDetailPanel, { type SelectedNodeData } from "./NodeDetailPanel";
import type { GraphRecommendation } from "@/lib/graph-recommendation-api";
import type { NextStepDecisionSnapshot } from "@/lib/node-progress-api";
import type { KnowledgeGraphRailMode } from "@/lib/knowledge-graph-workspace";

export default function KnowledgeGraphContextRail({
  railMode,
  node,
  recommendation,
  nextStepDecision,
  onAskAbout,
  onQuizNode,
  onCloseAction,
}: {
  railMode: KnowledgeGraphRailMode;
  node: SelectedNodeData | null;
  recommendation?: GraphRecommendation | null;
  nextStepDecision?: NextStepDecisionSnapshot | null;
  onAskAbout: (node: SelectedNodeData) => void;
  onQuizNode: (node: SelectedNodeData) => void;
  onCloseAction: () => void;
}) {
  return (
    <div className={railMode === "summary" ? "flex h-full flex-col p-4" : "flex h-full flex-col p-5"}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Tutor Rail</div>
          <h2 className="text-base font-semibold text-slate-900">
            {railMode === "summary" ? "Graph Context" : railMode === "chat" ? "Tutor Session" : "Quiz Workspace"}
          </h2>
        </div>
        {railMode !== "summary" ? (
          <button onClick={onCloseAction} className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
            Return to Graph
          </button>
        ) : null}
      </div>
      <NodeDetailPanel
        embedded
        className="flex-1 overflow-hidden rounded-[24px] border border-slate-200 bg-white"
        node={node}
        recommendation={recommendation ? {
          recommendedNodeId: recommendation.recommended_node_id,
          badge: "Recommended",
          message: recommendation.recommended_node_id,
        } : undefined}
        nextStepDecision={nextStepDecision ? {
          targetNodeId: nextStepDecision.target_node_id,
          badge: "Next Step",
          message: nextStepDecision.summary,
          ctaLabel: nextStepDecision.decision,
        } : undefined}
        onAskAbout={onAskAbout}
        onQuizNode={onQuizNode}
        onClose={onCloseAction}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run the rail-mode test to verify it passes**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-actions.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the contextual rail**

```bash
git add web/components/graph/KnowledgeGraphContextRail.tsx web/components/graph/NodeDetailPanel.tsx web/tests/knowledge-graph-actions.test.ts
git commit -m "feat: add contextual tutor rail for graph workspace"
```

## Task 5: Refactor KnowledgeGraphViewer To Orchestrate Overview, Focus Inset, And Rail Modes

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/tests/knowledge-graph-viewer-renderer.test.ts`
- Modify: `web/tests/knowledge-graph-viewer-clusters.test.ts`

- [ ] **Step 1: Write the failing viewer source tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/graph/KnowledgeGraphViewer.tsx", import.meta.url),
  "utf8",
);

test("KnowledgeGraphViewer renders a workspace shell with both graph surfaces", () => {
  assert.match(source, /KnowledgeGraphWorkspaceShell/);
  assert.match(source, /KnowledgeGraphFocusInset/);
  assert.match(source, /KnowledgeGraphContextRail/);
  assert.match(source, /surfaceVariant="overview"/);
});

test("KnowledgeGraphViewer opens the focus inset when a cluster is selected", () => {
  assert.match(source, /const \[railMode, setRailMode\] = useState/);
  assert.match(source, /buildWorkspaceState\(/);
  assert.match(source, /showFocusInset \? \(/);
});
```

- [ ] **Step 2: Run the viewer tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-viewer-renderer.test.ts web/tests/knowledge-graph-viewer-clusters.test.ts`
Expected: FAIL because the viewer still renders a single full-screen canvas plus overlay detail panel.

- [ ] **Step 3: Add workspace orchestration state and focused inset graph derivation**

```tsx
// inside web/components/graph/KnowledgeGraphViewer.tsx
const [railMode, setRailMode] = useState<KnowledgeGraphRailMode>("summary");

const workspaceState = useMemo(() => buildWorkspaceState({
  activeClusterId,
  selectedNodeId: selectedNode?.id ?? null,
  railMode,
}), [activeClusterId, railMode, selectedNode?.id]);

const focusedGraph = useMemo(() => {
  if (!workspaceState.focusClusterId) {
    return { nodes: [], edges: [] };
  }
  return buildFocusedCytoscapeSubgraph({ nodes, edges }, workspaceState.focusClusterId);
}, [edges, nodes, workspaceState.focusClusterId]);

const focusInsetPositions = useMemo(() => {
  if (!workspaceState.focusClusterId) return {};
  const childIds = focusedGraph.nodes
    .filter((node) => node.data.parentId === workspaceState.focusClusterId)
    .map((node) => node.data.id);
  return buildFocusInsetLayout(workspaceState.focusClusterId, childIds);
}, [focusedGraph.nodes, workspaceState.focusClusterId]);
```

- [ ] **Step 4: Replace the single-canvas overlay render tree with the workspace shell**

```tsx
return (
  <div className="h-full w-full bg-[radial-gradient(circle_at_top,_#eff6ff,_#e2e8f0_42%,_#f8fafc_100%)] p-4">
    <KnowledgeGraphWorkspaceShell
      overviewSlot={(
        <CytoscapeGraphCanvas
          nodes={nodes}
          edges={edges}
          positions={cytoscapePositions}
          onNodeClick={handleNodeClick}
          onNodeDragStop={handleNodeDragStop}
          onZoomTierChange={setZoomTier}
          focusNodeId={activeClusterId ?? selectedNode?.id ?? null}
          fitViewportVersion={fitViewportVersion}
          surfaceVariant="overview"
          className="h-full min-h-[720px]"
        />
      )}
      focusInsetSlot={workspaceState.showFocusInset ? (
        <KnowledgeGraphFocusInset
          title={selectedNode?.title ?? workspaceState.focusClusterId ?? "Focused cluster"}
          nodes={focusedGraph.nodes}
          edges={focusedGraph.edges}
          positions={focusInsetPositions}
          onNodeClick={handleNodeClick}
          onOpenDetail={() => selectedNode && setSelectedNode(selectedNode)}
          onAskAbout={() => selectedNode && handleAskAboutFromRail(selectedNode)}
          onStartQuiz={() => selectedNode && handleQuizFromRail(selectedNode)}
          onPinCluster={() => workspaceState.focusClusterId && setActiveClusterId(workspaceState.focusClusterId)}
          onClearFocus={() => setActiveClusterId(null)}
        />
      ) : null}
      railSlot={(
        <KnowledgeGraphContextRail
          railMode={railMode}
          node={selectedNode}
          recommendation={recommendation}
          nextStepDecision={nextStepDecision}
          onAskAbout={handleAskAboutFromRail}
          onQuizNode={handleQuizFromRail}
          onCloseAction={() => setRailMode("summary")}
        />
      )}
    />
  </div>
);
```

- [ ] **Step 5: Tie action handlers to contextual rail expansion and reset**

```tsx
const handleAskAboutFromRail = useCallback((node: SelectedNodeData) => {
  setRailMode("chat");
  setCurrentNodeId(node.id);
  persistRuntimeState(node.id, dynamicNodes, expandedClusterIds, layoutOverrides);
  updateNodeProgress(node.id, "explored");
  onAskAbout?.(node);
}, [dynamicNodes, expandedClusterIds, layoutOverrides, onAskAbout, persistRuntimeState, updateNodeProgress]);

const handleQuizFromRail = useCallback((node: SelectedNodeData) => {
  setRailMode("quiz");
  setCurrentNodeId(node.id);
  persistRuntimeState(node.id, dynamicNodes, expandedClusterIds, layoutOverrides);
  updateNodeProgress(node.id, "explored");
  onQuizNode?.(node);
}, [dynamicNodes, expandedClusterIds, layoutOverrides, onQuizNode, persistRuntimeState, updateNodeProgress]);
```

- [ ] **Step 6: Run the viewer tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-viewer-renderer.test.ts web/tests/knowledge-graph-viewer-clusters.test.ts web/tests/knowledge-graph-actions.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the workspace viewer orchestration**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx web/tests/knowledge-graph-viewer-renderer.test.ts web/tests/knowledge-graph-viewer-clusters.test.ts web/tests/knowledge-graph-actions.test.ts
git commit -m "feat: refactor knowledge graph into graph-first workspace"
```

## Task 6: Run Full Knowledge-Graph Verification And Capture The Final State

**Files:**
- Modify: `docs/superpowers/specs/2026-05-07-knowledge-graph-workspace-design.md`
  - Add a short implementation note or link to the shipped workspace plan if the team keeps specs updated after delivery.

- [ ] **Step 1: Run the targeted graph workspace suite**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-workspace.test.ts web/tests/cytoscape-knowledge-graph.test.ts web/tests/cytoscape-knowledge-graph-layout.test.ts web/tests/cytoscape-graph-canvas.test.ts web/tests/knowledge-graph-viewer-renderer.test.ts web/tests/knowledge-graph-viewer-clusters.test.ts web/tests/knowledge-graph-actions.test.ts`
Expected: PASS for all targeted graph workspace tests.

- [ ] **Step 2: Run the broader graph regression suite**

Run: `node --experimental-strip-types --test web/tests/cytoscape-knowledge-graph-visibility.test.ts web/tests/course-knowledge-graph.test.ts web/tests/knowledge-graph-layout.test.ts web/tests/knowledge-graph-hierarchy-contract.test.ts`
Expected: PASS so the workspace rewrite does not regress visibility, hierarchy, or existing graph semantics.

- [ ] **Step 3: Add the spec implementation note**

```md
## Implementation Note

- Workspace implementation plan: `docs/superpowers/plans/2026-05-07-knowledge-graph-workspace.md`
- Shipped architecture keeps Cytoscape for both overview and focus inset surfaces.
```

- [ ] **Step 4: Commit the verification and documentation update**

```bash
git add docs/superpowers/specs/2026-05-07-knowledge-graph-workspace-design.md
git commit -m "docs: link knowledge graph workspace spec to implementation"
```
