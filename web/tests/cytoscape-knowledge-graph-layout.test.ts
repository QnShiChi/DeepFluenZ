import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBackboneRadialLayout,
  buildExpandedClusterLayout,
  buildFocusInsetLayout,
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

test("buildExpandedClusterLayout grows radius for denser child clusters", () => {
  const sparse = buildExpandedClusterLayout("lesson-1", ["a", "b", "c"], {
    parent: { x: 500, y: 500 },
    radius: 180,
  });
  const dense = buildExpandedClusterLayout("lesson-1", ["a", "b", "c", "d", "e", "f", "g", "h"], {
    parent: { x: 500, y: 500 },
    radius: 180,
  });

  const sparseDistance = Math.hypot(sparse["a"].x - 500, sparse["a"].y - 500);
  const denseDistance = Math.hypot(dense["a"].x - 500, dense["a"].y - 500);

  assert.ok(denseDistance > sparseDistance);
});

test("buildBackboneRadialLayout keeps large backbone graphs within a readable outer bound", () => {
  const nodeIds = Array.from({ length: 18 }, (_, index) => `lesson-${index + 1}`);
  const positions = buildBackboneRadialLayout(nodeIds, {
    centerX: 400,
    centerY: 300,
    radius: 220,
  });

  const maxDistance = Math.max(
    ...Object.values(positions).map(({ x, y }) => Math.hypot(x - 400, y - 300)),
  );

  assert.ok(maxDistance <= 640);
});

test("buildFocusInsetLayout gives the cluster hub centered space and readable child radius", () => {
  const positions = buildFocusInsetLayout("lesson-2", ["subtopic-2-1", "subtopic-2-2", "subtopic-2-3"]);

  assert.deepEqual(positions["lesson-2"], { x: 280, y: 220 });
  assert.ok(positions["subtopic-2-1"].x !== 280 || positions["subtopic-2-1"].y !== 220);
  assert.ok(Math.abs(positions["subtopic-2-1"].x - 280) >= 150);
});
