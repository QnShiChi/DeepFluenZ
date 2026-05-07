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
