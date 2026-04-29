import test from "node:test";
import assert from "node:assert/strict";

import { describeAdaptiveGateStatus, groupGraphQaIssues } from "../lib/graph-qa-ui.ts";

test("describeAdaptiveGateStatus formats blocked copy", () => {
  assert.equal(
    describeAdaptiveGateStatus("adaptive_blocked"),
    "Adaptive guidance is blocked until critical graph issues are resolved.",
  );
});

test("GraphHealthPanel groups issues by severity", () => {
  const grouped = groupGraphQaIssues([
    {
      issue_id: "issue_1",
      severity: "critical",
      kind: "prerequisite_cycle",
      message: "Cycle",
      affected_node_ids: [],
      affected_edge_ids: [],
      why_it_matters: "",
    },
    {
      issue_id: "issue_2",
      severity: "high",
      kind: "orphan_node",
      message: "Orphan",
      affected_node_ids: [],
      affected_edge_ids: [],
      why_it_matters: "",
    },
  ]);

  assert.equal(grouped.critical.length, 1);
  assert.equal(grouped.high.length, 1);
});
