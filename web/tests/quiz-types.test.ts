import test from "node:test";
import assert from "node:assert/strict";

import { extractQuizQuestions } from "../lib/quiz-types.ts";

test("extractQuizQuestions carries graph context from result metadata", () => {
  const questions = extractQuizQuestions({
    graph_context: {
      course_id: "intro-ai",
      node_id: "topic_search",
    },
    summary: {
      results: [
        {
          qa_pair: {
            question_id: "q_1",
            question: "What is search?",
            question_type: "written",
            correct_answer: "Exploration",
            explanation: "Definition",
          },
        },
      ],
    },
  });

  assert.equal(questions?.[0]?.graph_context?.course_id, "intro-ai");
  assert.equal(questions?.[0]?.graph_context?.node_id, "topic_search");
});
