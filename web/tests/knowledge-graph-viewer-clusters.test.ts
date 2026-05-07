import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  filterVisibleFlowEdges,
  filterVisibleFlowNodes,
} from "../lib/course-knowledge-graph.ts";

const source = readFileSync(
  new URL("../components/graph/KnowledgeGraphViewer.tsx", import.meta.url),
  "utf8",
);

test("filterVisibleFlowNodes hides child subtopics in overview mode", () => {
  const nodes = [
    {
      id: "lesson-3",
      data: { label: "Bai 3", parentNodeId: "", hierarchyLevel: 0 },
      position: { x: 250, y: 60 },
    },
    {
      id: "subtopic-3-2",
      data: { label: "3.2 Cau truc chuong trinh Java", parentNodeId: "lesson-3", hierarchyLevel: 1 },
      position: { x: 520, y: 180 },
    },
  ] as any;

  const visible = filterVisibleFlowNodes(nodes, "overview", []);

  assert.deepEqual(visible.map((node) => node.id), ["lesson-3"]);
});

test("filterVisibleFlowNodes keeps expanded cluster children visible", () => {
  const nodes = [
    {
      id: "lesson-3",
      data: { label: "Bai 3", parentNodeId: "", hierarchyLevel: 0 },
      position: { x: 250, y: 60 },
    },
    {
      id: "subtopic-3-2",
      data: { label: "3.2 Cau truc chuong trinh Java", parentNodeId: "lesson-3", hierarchyLevel: 1 },
      position: { x: 520, y: 180 },
    },
  ] as any;

  const visible = filterVisibleFlowNodes(nodes, "expanded", ["lesson-3"]);

  assert.deepEqual(visible.map((node) => node.id), ["lesson-3", "subtopic-3-2"]);
});

test("filterVisibleFlowEdges removes edges whose nodes are hidden", () => {
  const edges = [
    {
      id: "contains-3-2",
      source: "lesson-3",
      target: "subtopic-3-2",
    },
  ] as any;

  const visibleEdges = filterVisibleFlowEdges(edges, new Set(["lesson-3"]));
  assert.equal(visibleEdges.length, 0);
});

test("KnowledgeGraphViewer keeps child-node clicks focused on the owning cluster", () => {
  assert.match(source, /setActiveClusterId\(node.data.parentId \|\| node.id\)/);
});
