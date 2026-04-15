import test from "node:test";
import assert from "node:assert/strict";

import {
  answersHiddenBeforeSubmit,
  canRevealQuestionFeedback,
  shouldShowScoreReport,
} from "../lib/exam-viewer-state.ts";

test("timed mode hides answers before submit", () => {
  assert.equal(answersHiddenBeforeSubmit("timed", false), true);
  assert.equal(answersHiddenBeforeSubmit("timed", true), false);
});

test("practice mode can reveal per-question feedback after grading", () => {
  const attempt = {
    attempt_id: "attempt_1",
    exam_id: "exam_1",
    session_id: "session_1",
    status: "graded",
    answers: [],
    score_report: {
      total_score: 0,
      max_score: 2,
      question_results: [],
      competency_breakdown: [],
      recommended_review: [],
    },
  } as const;

  assert.equal(canRevealQuestionFeedback("practice", attempt), true);
  assert.equal(shouldShowScoreReport("practice", attempt, true), true);
});
