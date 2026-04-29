import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001";

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

test("collectSafeBulkFixIds only returns safe fixes", async () => {
  const { collectSafeBulkFixIds } = await import("../lib/graph-qa-api.ts");
  const result = collectSafeBulkFixIds([
    { fix_id: "fix_1", safe_for_bulk_apply: true },
    { fix_id: "fix_2", safe_for_bulk_apply: false },
  ]);

  assert.deepEqual(result, ["fix_1"]);
});
