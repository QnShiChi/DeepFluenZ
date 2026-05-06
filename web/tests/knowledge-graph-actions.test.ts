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
      source_node_title: "Trí Tuệ Nhân Tạo Ứng Dụng",
      source_node_description: "Học phần cung cấp kiến thức nền tảng.",
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
    sourceNodeTitle: "Tìm kiếm",
    sourceNodeDescription: "Khái niệm tìm kiếm trong AI.",
    targetNodeTitle: "Giới thiệu không gian trạng thái",
    targetNodeDescription: "Nền tảng để hiểu bài toán tìm kiếm.",
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
  assert.equal(
    (request.config.graph_context as { source_node_title?: string }).source_node_title,
    "Tìm kiếm",
  );
  assert.equal(
    (request.config.graph_context as { target_node_title?: string }).target_node_title,
    "Giới thiệu không gian trạng thái",
  );
  assert.match(String(request.content), /topic_search|topic_intro|state_space/i);
  assert.match(
    String((request.config as { topic?: string }).topic),
    /Tìm kiếm|Giới thiệu không gian trạng thái|state_space/i,
  );
  assert.match(
    String((request.config as { preference?: string }).preference),
    /ignore unrelated earlier chat topics/i,
  );
});
