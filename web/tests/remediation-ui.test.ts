import test from "node:test";
import assert from "node:assert/strict";

import {
  describeRemediationCtaSet,
  describeRemediationStateBadge,
  didPassGraphQuiz,
  getRemediationQuizCount,
} from "../lib/remediation-ui.ts";

test("describeRemediationCtaSet returns the three failed-quiz actions", () => {
  assert.deepEqual(describeRemediationCtaSet(), [
    "Ôn lại phần yếu",
    "Làm lại quiz",
    "Quay lại graph",
  ]);
});

test("describeRemediationStateBadge formats remediation copy", () => {
  assert.equal(describeRemediationStateBadge("recommended"), "Cần ôn lại");
  assert.equal(describeRemediationStateBadge("passed_mini_quiz"), "Sẵn sàng kiểm tra lại");
});

test("didPassGraphQuiz mirrors the count-based pass policy", () => {
  assert.equal(didPassGraphQuiz(2, 3), true);
  assert.equal(didPassGraphQuiz(3, 5), false);
  assert.equal(didPassGraphQuiz(4, 5), true);
});

test("getRemediationQuizCount keeps remediation quizzes short", () => {
  assert.equal(getRemediationQuizCount("easy", 0), 2);
  assert.equal(getRemediationQuizCount("medium", 1), 4);
  assert.equal(getRemediationQuizCount("hard", 3), 5);
});
