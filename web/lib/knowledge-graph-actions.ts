import type { MessageRequestSnapshot, SendMessageOptions } from "../context/UnifiedChatContext.tsx";
import { DEFAULT_QUIZ_CONFIG, buildQuizWSConfig } from "./quiz-types.ts";

export interface KnowledgeGraphNodeActionInput {
  id: string;
  title: string;
  description: string;
  nodeType: string;
  difficulty: string;
  courseId?: string;
}

interface BuildKnowledgeGraphQuizMessageContext {
  language: string;
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
  const graphContext = node.courseId
    ? {
        course_id: node.courseId,
        node_id: node.id,
      }
    : undefined;
  const finalConfig = graphContext
    ? {
        ...config,
        graph_context: graphContext,
      }
    : config;

  const requestSnapshot: MessageRequestSnapshot = {
    content: node.title,
    capability: "deep_question",
    enabledTools: [],
    knowledgeBases: [],
    language: context.language,
    config: finalConfig,
  };

  return {
    content: node.title,
    config: finalConfig,
    options: {
      requestSnapshotOverride: requestSnapshot,
    },
  };
}
