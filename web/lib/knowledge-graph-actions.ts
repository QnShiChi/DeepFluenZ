import type { MessageRequestSnapshot, SendMessageOptions } from "../context/UnifiedChatContext.tsx";
import { DEFAULT_QUIZ_CONFIG, buildQuizWSConfig } from "./quiz-types.ts";
import { getNodeQuizCount, getRemediationQuizCount } from "./remediation-ui.ts";

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
  const questionCount = getNodeQuizCount(node.difficulty || "medium");
  const config = buildQuizWSConfig({
    ...DEFAULT_QUIZ_CONFIG,
    mode: "custom",
    topic: node.title,
    num_questions: questionCount,
    difficulty: node.difficulty || "medium",
    question_type: "choice",
    preference: "multiple_choice only",
  });
  const graphContext = node.courseId
    ? {
        course_id: node.courseId,
        node_id: node.id,
        source_node_title: node.title,
        source_node_description: node.description,
        quiz_kind: "node_quiz",
        node_difficulty: node.difficulty || "medium",
        requested_question_count: questionCount,
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
  sourceNodeTitle?: string;
  sourceNodeDescription?: string;
  targetNodeTitle?: string;
  targetNodeDescription?: string;
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
  const weakConceptText = input.weakConcepts.length > 0
    ? input.weakConcepts.join(", ")
    : "general prerequisite gaps";
  const sourceNodeLabel = input.sourceNodeTitle?.trim() || input.sourceNodeId;
  const targetNodeLabel = input.targetNodeTitle?.trim() || input.targetNodeId;
  const topic = input.weakConcepts.length > 0
    ? `Remediation quiz for source node ${sourceNodeLabel} targeting ${targetNodeLabel}. Focus only on these weak concepts: ${weakConceptText}.`
    : `Remediation quiz for source node ${sourceNodeLabel} targeting ${targetNodeLabel}. Focus only on prerequisite knowledge required for ${targetNodeLabel}.`;
  const content = `Ôn lại phần yếu cho node ${sourceNodeLabel} -> ${targetNodeLabel} (${weakConceptText})`;
  const config = {
    ...buildQuizWSConfig({
      ...DEFAULT_QUIZ_CONFIG,
      mode: "custom",
      topic,
      num_questions: questionCount,
      difficulty: input.nodeDifficulty || "medium",
      question_type: "choice",
      preference:
        "multiple_choice only; focus on the weak concepts and prerequisite gap; ignore unrelated earlier chat topics",
    }),
    topic,
    graph_context: {
      course_id: input.courseId,
      node_id: input.sourceNodeId,
      target_node_id: input.targetNodeId,
      source_node_title: input.sourceNodeTitle?.trim() || "",
      source_node_description: input.sourceNodeDescription?.trim() || "",
      target_node_title: input.targetNodeTitle?.trim() || "",
      target_node_description: input.targetNodeDescription?.trim() || "",
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
