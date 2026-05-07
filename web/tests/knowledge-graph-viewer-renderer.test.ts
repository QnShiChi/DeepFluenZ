import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/graph/KnowledgeGraphViewer.tsx", import.meta.url),
  "utf8",
);

test("KnowledgeGraphViewer renders the Cytoscape canvas instead of ReactFlow", () => {
  assert.match(source, /CytoscapeGraphCanvas/);
  assert.doesNotMatch(source, /<ReactFlow|from "@xyflow\/react"/);
});
