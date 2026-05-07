import test from "node:test";
import assert from "node:assert/strict";

import { shouldHandleNodeTap } from "../lib/cytoscape-graph-interactions.ts";

test("shouldHandleNodeTap suppresses a tap immediately after dragging the same node", () => {
  assert.equal(
    shouldHandleNodeTap(
      { nodeId: "lesson-2", timestampMs: 1_000 },
      "lesson-2",
      1_120,
    ),
    false,
  );
});

test("shouldHandleNodeTap allows taps after the drag cooldown expires", () => {
  assert.equal(
    shouldHandleNodeTap(
      { nodeId: "lesson-2", timestampMs: 1_000 },
      "lesson-2",
      1_400,
    ),
    true,
  );
});

test("shouldHandleNodeTap allows taps on other nodes even during the cooldown window", () => {
  assert.equal(
    shouldHandleNodeTap(
      { nodeId: "lesson-2", timestampMs: 1_000 },
      "lesson-3",
      1_120,
    ),
    true,
  );
});
