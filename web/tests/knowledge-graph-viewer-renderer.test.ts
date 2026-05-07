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
  assert.doesNotMatch(source, /<ReactFlow|from "@xyflow\/react"/);
});

test("KnowledgeGraphViewer expands parent clusters on node click", () => {
  assert.match(source, /resolveExpandedClusterIdsOnNodeClick/);
  assert.match(source, /setViewMode\("expanded"\)/);
  assert.match(source, /setFitViewportVersion\(\(value\) => value \+ 1\)/);
});

test("KnowledgeGraphViewer tracks active cluster and forwards focus props to CytoscapeGraphCanvas", () => {
  assert.match(source, /const \[activeClusterId, setActiveClusterId\] = useState/);
  assert.match(source, /const \[zoomTier, setZoomTier\] = useState/);
  assert.match(source, /activeClusterId,/);
  assert.match(source, /zoomTier,/);
  assert.match(source, /focusNodeId=\{activeClusterId \?\? selectedNode\?\.id \?\? null\}/);
  assert.match(source, /onZoomTierChange=\{setZoomTier\}/);
});

test("KnowledgeGraphViewer opens the focus inset from workspace state", () => {
  assert.match(source, /const \[railMode, setRailMode\] = useState/);
  assert.match(source, /buildWorkspaceState\(/);
  assert.match(source, /workspaceState\.showFocusInset \? \(/);
});
