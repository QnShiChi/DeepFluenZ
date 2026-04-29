import type { MessageRequestSnapshot, SendMessageOptions } from "../context/UnifiedChatContext.tsx";
import { DEFAULT_QUIZ_CONFIG, buildQuizWSConfig } from "./quiz-types.ts";
import { getRemediationQuizCount } from "./remediation-ui.ts";

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

export interface BuildGraphRemediationRequestInput {
  courseId: string;
  sourceNodeId: string;
  targetNodeId: string;
  weakConcepts: string[];
  nodeDifficulty: string;
  attemptCount: number;
  language?: string;
}

export function buildGraphRemediationRequest(
  input: BuildGraphRemediationRequestInput,
): {
  content: string;
  config: Record<string, unknown>;
  options: SendMessageOptions;
} {
  const questionCount = getRemediationQuizCount(input.nodeDifficulty, input.attemptCount);
  const topic = input.weakConcepts.length > 0
    ? `Review these weak concepts: ${input.weakConcepts.join(", ")}`
    : `Review prerequisite knowledge for ${input.targetNodeId}`;
  const content = "Ôn lại phần yếu của nút hiện tại";
  const config = {
    ...buildQuizWSConfig({
      ...DEFAULT_QUIZ_CONFIG,
      mode: "custom",
      topic,
      num_questions: questionCount,
      difficulty: input.nodeDifficulty || "medium",
      question_type: "choice",
      preference: "multiple_choice only; focus on the weak concepts and prerequisite gap",
    }),
    graph_context: {
      course_id: input.courseId,
      node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      weak_concepts: input.weakConcepts,
      node_difficulty: input.nodeDifficulty,
      quiz_kind: "remediation_quiz",
      requested_question_count: questionCount,
    },
  };

  const requestSnapshot: MessageRequestSnapshot = {
    content,
    capability: "deep_question",
    enabledTools: [],
    knowledgeBases: [],
    language: input.language || "en",
    config,
  };

  return {
    content,
    config,
    options: {
      displayUserMessage: false,
      persistUserMessage: false,
      requestSnapshotOverride: requestSnapshot,
    },
  };
}
