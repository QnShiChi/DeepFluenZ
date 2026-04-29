import test from "node:test";
import assert from "node:assert/strict";

import {
  describeAdaptiveGateStatus,
  describeGraphHealthStatus,
  groupGraphQaIssues,
  resolveGraphQaIssueNode,
} from "../lib/graph-qa-ui.ts";

test("describeAdaptiveGateStatus formats blocked copy", () => {
  assert.equal(
    describeAdaptiveGateStatus("adaptive_blocked"),
    "Adaptive guidance is blocked until critical graph issues are resolved.",
  );
});

test("describeGraphHealthStatus uses neutral copy when no report is available", () => {
  assert.equal(
    describeGraphHealthStatus(null),
    "Graph health has not been analyzed yet.",
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

test("resolveGraphQaIssueNode returns the affected node without mutating state", () => {
  const nodes = [
    { id: "topic_intro", title: "Intro" },
    { id: "topic_search", title: "Search" },
  ];

  const resolved = resolveGraphQaIssueNode(nodes, {
    issue_id: "issue_2",
    severity: "high",
    kind: "orphan_node",
    message: "Orphan",
    affected_node_ids: ["topic_search"],
    affected_edge_ids: [],
    why_it_matters: "",
  });

  assert.deepEqual(resolved, { id: "topic_search", title: "Search" });
  assert.deepEqual(nodes, [
    { id: "topic_intro", title: "Intro" },
    { id: "topic_search", title: "Search" },
  ]);
});
