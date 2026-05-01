import test from "node:test";
import assert from "node:assert/strict";

import {
  describeGraphRecommendation,
  getGraphRecommendationTimelineCtaLabel,
} from "../lib/graph-recommendation-ui.ts";

test("describeGraphRecommendation formats remediation copy", () => {
  const summary = describeGraphRecommendation({
    recommended_node_id: "topic_intro",
    mode: "remediate",
    score: 0.82,
    reason_codes: ["recent_quiz_weakness"],
    backup_node_ids: ["topic_history"],
  });

  assert.equal(summary.badge, "ÔN LẠI");
  assert.match(summary.message, /ôn lại|tiếp tục/i);
});

test("describeGraphRecommendation formats advance copy", () => {
  const summary = describeGraphRecommendation({
    recommended_node_id: "topic_search",
    mode: "advance",
    score: 0.74,
    reason_codes: ["prerequisites_ready", "close_to_current_path"],
    backup_node_ids: [],
  });

  assert.equal(summary.badge, "Tiếp theo");
  assert.match(summary.message, /tiên quyết|lộ trình/i);
});

test("getGraphRecommendationTimelineCtaLabel adapts to remediation mode", () => {
  assert.equal(
    getGraphRecommendationTimelineCtaLabel({ mode: "remediate" }),
    "Vì sao cần ôn lại?",
  );
  assert.equal(
    getGraphRecommendationTimelineCtaLabel({ mode: "advance" }),
    "Vì sao được đề xuất?",
  );
});
