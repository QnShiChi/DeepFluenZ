/**
 * Shared types for Quiz Generation (deep_question capability).
 */

export type DeepQuestionMode = "custom" | "mimic";

export interface DeepQuestionFormConfig {
  mode: DeepQuestionMode;
  topic: string;
  num_questions: number;
  difficulty: string;
  question_type: string;
  preference: string;
  paper_path: string;
  max_questions: number;
}

export const DEFAULT_QUIZ_CONFIG: DeepQuestionFormConfig = {
  mode: "custom",
  topic: "",
  num_questions: 3,
  difficulty: "auto",
  question_type: "auto",
  preference: "",
  paper_path: "",
  max_questions: 10,
};

export interface QuizQuestion {
  question_id: string;
  source_question_id?: string;
  question: string;
  question_type: "choice" | "written" | "coding";
  options?: Record<string, string>;
  correct_answer: string;
  explanation: string;
  difficulty?: string;
  concentration?: string;
  knowledge_context?: string;
  graph_context?: {
    course_id: string;
    node_id: string;
    quiz_kind?: "node_quiz" | "remediation_quiz";
    target_node_id?: string;
    source_node_title?: string;
    source_node_description?: string;
    target_node_title?: string;
    target_node_description?: string;
    weak_concepts?: string[];
    node_difficulty?: string;
  };
}

function hashQuizText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function buildScopedQuizQuestionId(
  rawQuestionId: string,
  question: string,
  index: number,
  graphContext?: {
    course_id: string;
    node_id: string;
    quiz_kind?: "node_quiz" | "remediation_quiz";
    target_node_id?: string;
    source_node_title?: string;
    target_node_title?: string;
  },
): string {
  const baseId = rawQuestionId || `question_${index + 1}`;
  if (!graphContext) return baseId;
  const targetPart = graphContext.target_node_id || "";
  const quizKind = graphContext.quiz_kind || "node_quiz";
  const fingerprint = hashQuizText(`${baseId}:${question}`);
  return [
    quizKind,
    graphContext.course_id,
    graphContext.node_id,
    targetPart,
    baseId,
    fingerprint,
  ].join("::");
}

export interface QuizFollowupContext {
  parent_quiz_session_id?: string;
  question_id: string;
  question: string;
  question_type: QuizQuestion["question_type"];
  options?: Record<string, string>;
  correct_answer: string;
  explanation: string;
  difficulty?: string;
  concentration?: string;
  knowledge_context?: string;
  user_answer?: string;
  is_correct?: boolean;
}

/**
 * Extract QuizQuestion[] from the raw `result` event metadata returned by
 * the deep_question capability.
 */
export function extractQuizQuestions(
  resultMetadata: Record<string, unknown> | undefined,
): QuizQuestion[] | null {
  if (!resultMetadata) return null;
  const summary = resultMetadata.summary as Record<string, unknown> | undefined;
  if (!summary) return null;
  const results = summary.results as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(results) || results.length === 0) return null;

  const parsed: Array<QuizQuestion | null> = results.map((item, index) => {
    const qa = (item.qa_pair ?? item) as Record<string, unknown>;
    if (!qa.question) return null;
    const graphContextRaw = resultMetadata.graph_context as Record<string, unknown> | undefined;
    const graphContext =
      graphContextRaw &&
      typeof graphContextRaw.course_id === "string" &&
      typeof graphContextRaw.node_id === "string"
        ? {
            course_id: graphContextRaw.course_id,
            node_id: graphContextRaw.node_id,
            quiz_kind:
              graphContextRaw.quiz_kind === "node_quiz" || graphContextRaw.quiz_kind === "remediation_quiz"
                ? graphContextRaw.quiz_kind
                : undefined,
            target_node_id:
              typeof graphContextRaw.target_node_id === "string"
                ? graphContextRaw.target_node_id
                : undefined,
            source_node_title:
              typeof graphContextRaw.source_node_title === "string"
                ? graphContextRaw.source_node_title
                : undefined,
            source_node_description:
              typeof graphContextRaw.source_node_description === "string"
                ? graphContextRaw.source_node_description
                : undefined,
            target_node_title:
              typeof graphContextRaw.target_node_title === "string"
                ? graphContextRaw.target_node_title
                : undefined,
            target_node_description:
              typeof graphContextRaw.target_node_description === "string"
                ? graphContextRaw.target_node_description
                : undefined,
            weak_concepts: Array.isArray(graphContextRaw.weak_concepts)
              ? graphContextRaw.weak_concepts.filter(
                  (concept): concept is string => typeof concept === "string" && concept.length > 0,
                )
              : undefined,
            node_difficulty:
              typeof graphContextRaw.node_difficulty === "string"
                ? graphContextRaw.node_difficulty
                : undefined,
          }
        : undefined;
    const rawQuestionId = String(qa.question_id ?? "");
    const scopedQuestionId = buildScopedQuizQuestionId(
      rawQuestionId,
      String(qa.question ?? ""),
      index,
      graphContext,
    );
    const question: QuizQuestion = {
      question_id: scopedQuestionId,
      source_question_id: rawQuestionId || undefined,
      question: String(qa.question ?? ""),
      question_type: (qa.question_type as QuizQuestion["question_type"]) ?? "written",
      options: qa.options as Record<string, string> | undefined,
      correct_answer: String(qa.correct_answer ?? ""),
      explanation: String(qa.explanation ?? ""),
      difficulty: qa.difficulty ? String(qa.difficulty) : undefined,
      concentration: qa.concentration ? String(qa.concentration) : undefined,
      knowledge_context:
        qa.metadata &&
        typeof qa.metadata === "object" &&
        "knowledge_context" in qa.metadata &&
        qa.metadata.knowledge_context
          ? String(qa.metadata.knowledge_context)
          : undefined,
      graph_context: graphContext,
    };
    return question;
  });

  return parsed.filter((question): question is QuizQuestion => question !== null);
}

export function buildQuizFollowupConfig(
  question: QuizQuestion,
  userAnswer: string,
  isCorrect: boolean | null,
  parentQuizSessionId?: string | null,
): Record<string, unknown> {
  const context: QuizFollowupContext = {
    question_id: question.question_id,
    question: question.question,
    question_type: question.question_type,
    options: question.options,
    correct_answer: question.correct_answer,
    explanation: question.explanation,
    difficulty: question.difficulty,
    concentration: question.concentration,
    knowledge_context: question.knowledge_context,
    user_answer: userAnswer || undefined,
    is_correct: typeof isCorrect === "boolean" ? isCorrect : undefined,
    parent_quiz_session_id: parentQuizSessionId || undefined,
  };

  return {
    followup_question_context: context,
  };
}

/**
 * Build the `config` payload to send over WebSocket for a quiz generation
 * request.
 */
export function buildQuizWSConfig(
  cfg: DeepQuestionFormConfig,
): Record<string, unknown> {
  if (cfg.mode === "mimic") {
    return {
      mode: "mimic",
      paper_path: cfg.paper_path.trim(),
      max_questions: cfg.max_questions,
    };
  }
  return {
    mode: "custom",
    num_questions: cfg.num_questions,
    difficulty: cfg.difficulty === "auto" ? "" : cfg.difficulty,
    question_type: cfg.question_type === "auto" ? "" : cfg.question_type,
    preference: cfg.preference.trim(),
  };
}
