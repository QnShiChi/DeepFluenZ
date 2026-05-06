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

test("extractQuizQuestions preserves remediation quiz metadata", () => {
  const questions = extractQuizQuestions({
    graph_context: {
      course_id: "intro-ai",
      node_id: "topic_search",
      quiz_kind: "remediation_quiz",
      target_node_id: "topic_intro",
      source_node_title: "Tìm kiếm",
      source_node_description: "Khái niệm tìm kiếm trong AI.",
      target_node_title: "Giới thiệu không gian trạng thái",
      target_node_description: "Nền tảng để hiểu bài toán tìm kiếm.",
      weak_concepts: ["state_space"],
      node_difficulty: "easy",
    },
    summary: {
      results: [
        {
          qa_pair: {
            question_id: "q_1",
            question: "What is search?",
            question_type: "choice",
            correct_answer: "Exploration",
            explanation: "Definition",
          },
        },
      ],
    },
  });

  assert.equal(questions?.[0]?.graph_context?.quiz_kind, "remediation_quiz");
  assert.equal(questions?.[0]?.graph_context?.target_node_id, "topic_intro");
  assert.equal(questions?.[0]?.graph_context?.source_node_title, "Tìm kiếm");
  assert.equal(questions?.[0]?.graph_context?.target_node_title, "Giới thiệu không gian trạng thái");
  assert.deepEqual(questions?.[0]?.graph_context?.weak_concepts, ["state_space"]);
  assert.equal(questions?.[0]?.graph_context?.node_difficulty, "easy");
});

test("extractQuizQuestions scopes graph-linked question ids per node quiz instance", () => {
  const first = extractQuizQuestions({
    graph_context: {
      course_id: "intro-ai",
      node_id: "topic_search",
      quiz_kind: "node_quiz",
    },
    summary: {
      results: [
        {
          qa_pair: {
            question_id: "q_1",
            question: "What is search?",
            question_type: "choice",
            correct_answer: "A",
            explanation: "Definition",
          },
        },
      ],
    },
  });
  const second = extractQuizQuestions({
    graph_context: {
      course_id: "intro-ai",
      node_id: "topic_oop",
      quiz_kind: "node_quiz",
    },
    summary: {
      results: [
        {
          qa_pair: {
            question_id: "q_1",
            question: "What is OOP?",
            question_type: "choice",
            correct_answer: "A",
            explanation: "Definition",
          },
        },
      ],
    },
  });

  assert.notEqual(first?.[0]?.question_id, second?.[0]?.question_id);
  assert.equal(first?.[0]?.source_question_id, "q_1");
  assert.equal(second?.[0]?.source_question_id, "q_1");
});
