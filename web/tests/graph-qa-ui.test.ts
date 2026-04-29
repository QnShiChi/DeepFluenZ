import test from "node:test";
import assert from "node:assert/strict";

import { describeAdaptiveGateStatus } from "../lib/graph-qa-ui.ts";

test("describeAdaptiveGateStatus formats blocked copy", () => {
  assert.equal(
    describeAdaptiveGateStatus("adaptive_blocked"),
    "Adaptive guidance is blocked until critical graph issues are resolved.",
  );
});
