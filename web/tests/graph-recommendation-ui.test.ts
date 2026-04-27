import test from "node:test";
import assert from "node:assert/strict";

import { describeGraphRecommendation } from "../lib/graph-recommendation-ui.ts";

test("describeGraphRecommendation formats remediation copy", () => {
  const summary = describeGraphRecommendation({
    recommended_node_id: "topic_intro",
    mode: "remediate",
    score: 0.82,
    reason_codes: ["recent_quiz_weakness"],
    backup_node_ids: ["topic_history"],
  });

  assert.equal(summary.badge, "Review first");
  assert.match(summary.message, /quiz/i);
});
