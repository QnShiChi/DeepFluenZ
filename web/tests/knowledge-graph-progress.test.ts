import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeKnowledgeGraphProgress,
  reconcileKnowledgeGraphProgressAfterSync,
} from "../lib/knowledge-graph-progress.ts";
import { normalizeNodeProgressSnapshot } from "../lib/node-progress-api.ts";

test("mergeKnowledgeGraphProgress keeps local mastered status when remote is weaker", () => {
  const merged = mergeKnowledgeGraphProgress(
    { topic_intro: "mastered", topic_search: "explored" },
    { topic_intro: "explored", topic_planning: "explored" },
  );

  assert.deepEqual(merged, {
    topic_intro: "mastered",
    topic_search: "explored",
    topic_planning: "explored",
  });
});

test("reconcileKnowledgeGraphProgressAfterSync keeps local progress when sync succeeds", () => {
  const reconciled = reconcileKnowledgeGraphProgressAfterSync(
    {
      topic_intro: "mastered",
      topic_search: "explored",
    },
    {},
  );

  assert.deepEqual(reconciled, {
    topic_intro: "mastered",
    topic_search: "explored",
  });
});

test("reconcileKnowledgeGraphProgressAfterSync preserves only failed entries when sync partially fails", () => {
  const reconciled = reconcileKnowledgeGraphProgressAfterSync(
    {
      topic_intro: "mastered",
      topic_search: "explored",
    },
    {
      topic_search: "explored",
    },
  );

  assert.deepEqual(reconciled, {
    topic_search: "explored",
  });
});

test("normalizeNodeProgressSnapshot keeps next-step tutor payload", () => {
  const parsed = normalizeNodeProgressSnapshot({
    progress: { topic_search: "explored" },
    current_node_id: "topic_search",
    dynamic_nodes: [],
    active_remediation: null,
    in_session_knowledge_state: {
      active_node_id: "topic_search",
      next_step_decision: {
        action: "advance",
        target_node_id: "topic_planning",
        reason_tags: ["ready_to_advance"],
        explanation_summary: "Ban da san sang di tiep.",
      },
    },
    next_step_decision: {
      action: "advance",
      target_node_id: "topic_planning",
      reason_tags: ["ready_to_advance"],
      explanation_summary: "Ban da san sang di tiep.",
    },
  });

  assert.equal(parsed.next_step_decision?.action, "advance");
  assert.equal(parsed.next_step_decision?.target_node_id, "topic_planning");
});
