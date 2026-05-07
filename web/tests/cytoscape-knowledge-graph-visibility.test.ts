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
