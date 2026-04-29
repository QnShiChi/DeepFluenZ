import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGraphRemediationRequest,
  buildKnowledgeGraphQuizMessage,
} from "../lib/knowledge-graph-actions.ts";

test("buildKnowledgeGraphQuizMessage produces a deep_question request without KB or rag coupling", () => {
  const request = buildKnowledgeGraphQuizMessage(
    {
      id: "topic_intro",
      title: "Trí Tuệ Nhân Tạo Ứng Dụng",
      description: "Học phần cung cấp kiến thức nền tảng.",
      nodeType: "topic",
      difficulty: "medium",
      courseId: "intro-ai",
    },
    {
      language: "vi",
    },
  );

  assert.equal(request.content, "Trí Tuệ Nhân Tạo Ứng Dụng");
  assert.deepEqual(request.config, {
    mode: "custom",
    num_questions: 5,
    difficulty: "medium",
    question_type: "choice",
    preference: "multiple_choice only",
    graph_context: {
      course_id: "intro-ai",
      node_id: "topic_intro",
      quiz_kind: "node_quiz",
      node_difficulty: "medium",
      requested_question_count: 5,
    },
  });
  assert.equal(request.options.requestSnapshotOverride?.capability, "deep_question");
  assert.deepEqual(request.options.requestSnapshotOverride?.enabledTools, []);
  assert.deepEqual(request.options.requestSnapshotOverride?.knowledgeBases, []);
  assert.equal(request.options.requestSnapshotOverride?.language, "vi");
  assert.ok(!("language" in request.config));
});

test("buildGraphRemediationRequest creates a remediation lesson payload", () => {
  const request = buildGraphRemediationRequest({
    courseId: "intro-ai",
    sourceNodeId: "topic_search",
    targetNodeId: "topic_intro",
    weakConcepts: ["state_space"],
    nodeDifficulty: "easy",
    attemptCount: 0,
    language: "vi",
  });

  assert.equal(request.options.displayUserMessage, false);
  assert.equal(request.options.persistUserMessage, false);
  assert.equal(request.options.requestSnapshotOverride?.capability, "deep_question");
  assert.equal(
    (request.config.graph_context as { quiz_kind?: string }).quiz_kind,
    "remediation_quiz",
  );
  assert.equal(
    (request.config.graph_context as { target_node_id?: string }).target_node_id,
    "topic_intro",
  );
});
