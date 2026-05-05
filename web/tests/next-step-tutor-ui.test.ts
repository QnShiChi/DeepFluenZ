import test from "node:test";
import assert from "node:assert/strict";

import { describeNextStepDecision } from "../lib/next-step-tutor-ui.ts";

test("describeNextStepDecision returns remediation CTA copy", () => {
  assert.deepEqual(
    describeNextStepDecision({
      action: "start_targeted_remediation",
      target_node_id: "topic_search",
      reason_tags: ["recent_failure", "retry_loop_detected"],
      explanation_summary: "On lai phan yeu truoc khi di tiep.",
    }),
    {
      badge: "Tutor recommendation",
      ctaLabel: "On lai phan yeu",
      tone: "warning",
      summary: "On lai phan yeu truoc khi di tiep.",
    },
  );
});
