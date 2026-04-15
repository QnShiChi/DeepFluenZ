import test from "node:test";
import assert from "node:assert/strict";

import { buildChoiceResponse, materializeExamAttemptAnswers } from "../lib/exam-api.ts";

test("buildChoiceResponse wraps selected ids for the attempt payload", () => {
  assert.deepEqual(buildChoiceResponse(["B"]), { choice_ids: ["B"] });
});

test("materializeExamAttemptAnswers converts a draft answer map into api answers", () => {
  const now = Date.now();
  const answers = materializeExamAttemptAnswers(
    {
      q1: { choice_ids: ["B"] },
      q2: { text: "Continuity matters." },
    },
    now,
  );

  assert.equal(answers.length, 2);
  assert.equal(answers[0]?.question_id, "q1");
  assert.deepEqual(answers[0]?.response, { choice_ids: ["B"] });
  assert.equal(answers[0]?.answered_at, now);
  assert.equal(answers[1]?.question_id, "q2");
});
