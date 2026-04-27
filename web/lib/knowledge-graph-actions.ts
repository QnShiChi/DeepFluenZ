import type { MessageRequestSnapshot, SendMessageOptions } from "../context/UnifiedChatContext.tsx";
import { DEFAULT_QUIZ_CONFIG, buildQuizWSConfig } from "./quiz-types.ts";

export interface KnowledgeGraphNodeActionInput {
  id: string;
  title: string;
  description: string;
  nodeType: string;
  difficulty: string;
}

interface BuildKnowledgeGraphQuizMessageContext {
  language: string;
  knowledgeBases: string[];
}

export function buildKnowledgeGraphQuizMessage(
  node: KnowledgeGraphNodeActionInput,
  context: BuildKnowledgeGraphQuizMessageContext,
): {
  content: string;
  config: Record<string, unknown>;
  options: SendMessageOptions;
} {
  const config = buildQuizWSConfig({
    ...DEFAULT_QUIZ_CONFIG,
    mode: "custom",
    topic: node.title,
    num_questions: 3,
    difficulty: node.difficulty || "medium",
  });

  const requestSnapshot: MessageRequestSnapshot = {
    content: node.title,
    capability: "deep_question",
    enabledTools: ["rag", "web_search", "code_execution"],
    knowledgeBases: [...context.knowledgeBases],
    language: context.language,
    config,
  };

  return {
    content: node.title,
    config,
    options: {
      requestSnapshotOverride: requestSnapshot,
    },
  };
}
