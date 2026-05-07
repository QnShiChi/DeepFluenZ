import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLayoutOverrides,
  buildClusterLayout,
} from "../lib/knowledge-graph-layout.ts";

test("buildClusterLayout places children around the parent cluster", () => {
  const layout = buildClusterLayout({
    parentId: "lesson-3",
    parentPosition: { x: 400, y: 200 },
    childIds: ["subtopic-3-1", "subtopic-3-2", "subtopic-3-3"],
    radius: 160,
  });

  assert.equal(layout["subtopic-3-1"].x !== 400, true);
  assert.equal(layout["subtopic-3-2"].y !== 200, true);
});

test("applyLayoutOverrides prefers manual positions when present", () => {
  const resolved = applyLayoutOverrides(
    {
      "lesson-3": { x: 250, y: 80 },
      "subtopic-3-2": { x: 420, y: 220 },
    },
    {
      "subtopic-3-2": { x: 600, y: 320 },
    },
  );

  assert.deepEqual(resolved["subtopic-3-2"], { x: 600, y: 320 });
});
