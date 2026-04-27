export const KNOWLEDGE_GRAPH_COPY = {
  importSyllabus: "Nhập đề cương",
  extractingGraph: "Đang trích xuất sơ đồ AI...",
  recommendedNodeCta: "Đi tới nút được đề xuất",
  askAboutTopic: "Hỏi về chủ đề này",
  testKnowledge: "Kiểm tra kiến thức",
  noDescription: "Chưa có mô tả cho nội dung này.",
} as const;

const NODE_TYPE_LABELS: Record<string, string> = {
  topic: "Chủ đề",
  concept: "Khái niệm",
  skill: "Kỹ năng",
  application: "Ứng dụng",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

export function getKnowledgeGraphNodeTypeLabel(nodeType: string): string {
  return NODE_TYPE_LABELS[nodeType] ?? "Chủ đề";
}

export function formatKnowledgeGraphDifficultyLabel(difficulty: string): string {
  return DIFFICULTY_LABELS[difficulty] ?? difficulty;
}
