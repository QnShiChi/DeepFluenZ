import test from "node:test";
import assert from "node:assert/strict";

import { isQuizAnswerCorrect } from "../lib/quiz-grading.ts";

test("written answers ignore casing and repeated whitespace", () => {
  const result = isQuizAnswerCorrect(
    {
      question_type: "written",
      correct_answer: "Trí tuệ nhân tạo",
    },
    {
      selected: null,
      typed: "  trí   tuệ   nhân   tạo  ",
    },
  );

  assert.equal(result, true);
});

test("coding answers ignore code fences and indentation-only formatting differences", () => {
  const result = isQuizAnswerCorrect(
    {
      question_type: "coding",
      correct_answer: "```python\nfor value in items:\n    print(value)\n```",
    },
    {
      selected: null,
      typed: "for value in items:\n print(value)",
    },
  );

  assert.equal(result, true);
});
