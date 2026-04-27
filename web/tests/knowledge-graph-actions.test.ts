import test from "node:test";
import assert from "node:assert/strict";

import { buildKnowledgeGraphQuizMessage } from "../lib/knowledge-graph-actions.ts";

test("buildKnowledgeGraphQuizMessage produces a deep_question request without leaking language into config", () => {
  const request = buildKnowledgeGraphQuizMessage(
    {
      id: "topic_intro",
      title: "Trí Tuệ Nhân Tạo Ứng Dụng",
      description: "Học phần cung cấp kiến thức nền tảng.",
      nodeType: "topic",
      difficulty: "medium",
    },
    {
      language: "vi",
      knowledgeBases: ["ai-course"],
    },
  );

  assert.equal(request.content, "Trí Tuệ Nhân Tạo Ứng Dụng");
  assert.deepEqual(request.config, {
    mode: "custom",
    num_questions: 3,
    difficulty: "medium",
    question_type: "",
    preference: "",
  });
  assert.equal(request.options.requestSnapshotOverride?.capability, "deep_question");
  assert.deepEqual(request.options.requestSnapshotOverride?.enabledTools, [
    "rag",
    "web_search",
    "code_execution",
  ]);
  assert.equal(request.options.requestSnapshotOverride?.language, "vi");
  assert.ok(!("language" in request.config));
});
