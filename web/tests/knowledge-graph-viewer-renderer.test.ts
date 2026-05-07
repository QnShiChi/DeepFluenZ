import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/graph/KnowledgeGraphViewer.tsx", import.meta.url),
  "utf8",
);
const workspacePageSource = readFileSync(
  new URL("../app/(workspace)/page.tsx", import.meta.url),
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
  assert.match(source, /workspaceState\.showFocusInset && isFocusInsetOpen \? \(/);
});

test("KnowledgeGraphViewer keeps timeline and recommendation helpers available in embedded mode", () => {
  assert.match(source, /<LearningTimelineDrawer/);
  assert.doesNotMatch(source, /\{layoutMode === "standalone" \? \(\s*<LearningTimelineDrawer/);
  assert.doesNotMatch(source, /layoutMode === "standalone" && recommendation/);
  assert.match(source, /onOpenTimeline=\{\(\) => selectedNode && openTimeline\(selectedNode.id\)\}/);
});

test("KnowledgeGraphViewer lets users toggle the recommendation card visibility", () => {
  assert.match(source, /const \[isRecommendationCardOpen, setIsRecommendationCardOpen\] = useState\(true\)/);
  assert.match(source, /setIsRecommendationCardOpen\(true\)/);
  assert.match(source, /Ẩn nhắc học/);
  assert.match(source, /Hiện nhắc học/);
  assert.match(source, /absolute right-4 top-4 z-10 rounded-xl border border-blue-200/);
  assert.match(source, /absolute right-4 top-4 z-10 rounded-full border border-blue-200/);
});

test("workspace page mounts KnowledgeGraphViewer in embedded mode", () => {
  assert.match(workspacePageSource, /<KnowledgeGraphViewer/);
  assert.match(workspacePageSource, /layoutMode="embedded"/);
  assert.match(workspacePageSource, /w-\[65%\]/);
  assert.match(workspacePageSource, /w-\[35%\]/);
});
