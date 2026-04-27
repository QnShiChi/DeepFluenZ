import test from "node:test";
import assert from "node:assert/strict";

import {
  formatKnowledgeGraphDifficultyLabel,
  getKnowledgeGraphNodeTypeLabel,
  KNOWLEDGE_GRAPH_COPY,
} from "../lib/knowledge-graph-copy.ts";

test("knowledge graph copy stays in Vietnamese", () => {
  assert.equal(KNOWLEDGE_GRAPH_COPY.importSyllabus, "Nhập đề cương");
  assert.equal(KNOWLEDGE_GRAPH_COPY.extractingGraph, "Đang trích xuất sơ đồ AI...");
  assert.equal(KNOWLEDGE_GRAPH_COPY.recommendedNodeCta, "Đi tới nút được đề xuất");
  assert.equal(KNOWLEDGE_GRAPH_COPY.askAboutTopic, "Hỏi về chủ đề này");
  assert.equal(KNOWLEDGE_GRAPH_COPY.testKnowledge, "Kiểm tra kiến thức");
});

test("knowledge graph labels map node type and difficulty to Vietnamese", () => {
  assert.equal(getKnowledgeGraphNodeTypeLabel("topic"), "Chủ đề");
  assert.equal(getKnowledgeGraphNodeTypeLabel("concept"), "Khái niệm");
  assert.equal(getKnowledgeGraphNodeTypeLabel("skill"), "Kỹ năng");
  assert.equal(getKnowledgeGraphNodeTypeLabel("application"), "Ứng dụng");
  assert.equal(formatKnowledgeGraphDifficultyLabel("easy"), "Dễ");
  assert.equal(formatKnowledgeGraphDifficultyLabel("medium"), "Trung bình");
  assert.equal(formatKnowledgeGraphDifficultyLabel("hard"), "Khó");
});
