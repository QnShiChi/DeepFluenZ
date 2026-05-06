import test from "node:test";
import assert from "node:assert/strict";

import { normalizeNodeProgressSnapshot } from "../lib/node-progress-api.ts";

test("normalizeNodeProgressSnapshot keeps review queue entries", () => {
  const snapshot = normalizeNodeProgressSnapshot({
    progress: {},
    current_node_id: "topic_search",
    dynamic_nodes: [],
    active_remediation: null,
    review_state: {
      nodes: {
        topic_intro: {
          due_at: "2026-05-06T09:00:00Z",
          forgetting_risk: 0.8,
          retrievability: 0.35,
          review_mode: "full_node_review",
        },
      },
    },
    review_queue: [
      {
        node_id: "topic_intro",
        review_mode: "full_node_review",
        score: 0.87,
        due_at: "2026-05-06T09:00:00Z",
        reason_codes: ["needs_review_before_advance"],
      },
    ],
  });

  assert.equal(snapshot.review_queue?.[0]?.node_id, "topic_intro");
  assert.equal(snapshot.review_state?.nodes?.topic_intro?.review_mode, "full_node_review");
});
