export type CourseAssistantMode = "qa" | "exam" | "study_plan" | "summary";
export type CourseAssistantOutputFormat = "markdown" | "json";

export interface CourseAssistantFormConfig {
  mode: CourseAssistantMode;
  top_k: number;
  num_questions: number;
  difficulty: string;
  question_type: string;
  chapter: string;
  section: string;
  output_format: CourseAssistantOutputFormat;
  include_sources: boolean;
}

export interface CourseAssistantRequestPayload {
  content: string;
  config: Record<string, unknown>;
}

export const DEFAULT_COURSE_ASSISTANT_CONFIG: CourseAssistantFormConfig = {
  mode: "qa",
  top_k: 5,
  num_questions: 3,
  difficulty: "",
  question_type: "",
  chapter: "",
  section: "",
  output_format: "markdown",
  include_sources: true,
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCourseAssistantConfig(
  raw: Record<string, unknown> | undefined,
): CourseAssistantFormConfig {
  const mode: CourseAssistantMode =
    raw?.mode === "exam" ||
    raw?.mode === "study_plan" ||
    raw?.mode === "summary"
      ? raw.mode
      : "qa";

  const output_format: CourseAssistantOutputFormat =
    raw?.output_format === "json" ? "json" : "markdown";

  return {
    mode,
    top_k: clampInteger(raw?.top_k, DEFAULT_COURSE_ASSISTANT_CONFIG.top_k, 1, 20),
    num_questions: clampInteger(
      raw?.num_questions,
      DEFAULT_COURSE_ASSISTANT_CONFIG.num_questions,
      1,
      20,
    ),
    difficulty: cleanText(raw?.difficulty),
    question_type: cleanText(raw?.question_type),
    chapter: cleanText(raw?.chapter),
    section: cleanText(raw?.section),
    output_format,
    include_sources:
      typeof raw?.include_sources === "boolean"
        ? raw.include_sources
        : DEFAULT_COURSE_ASSISTANT_CONFIG.include_sources,
  };
}

function fallbackContent(config: CourseAssistantFormConfig): string {
  const chapter = config.chapter || "this course";
  const section = config.section || "";

  if (config.mode === "exam") {
    const difficulty = config.difficulty ? `${config.difficulty} ` : "";
    const questionType = config.question_type ? `${config.question_type} ` : "";
    return `Generate ${config.num_questions} ${difficulty}${questionType}questions for ${chapter}.`;
  }

  if (config.mode === "study_plan") {
    return section
      ? `Create a study plan for ${section} in ${chapter}.`
      : `Create a study plan for ${chapter}.`;
  }

  if (config.mode === "summary") {
    return section
      ? `Summarize ${section} in ${chapter}.`
      : `Summarize ${chapter}.`;
  }

  return "";
}

export function buildCourseAssistantRequest(
  rawInput: string,
  config: CourseAssistantFormConfig,
): CourseAssistantRequestPayload {
  const content = rawInput.trim() || fallbackContent(config);
  const requestConfig: Record<string, unknown> = {
    mode: config.mode,
    top_k: config.top_k,
    output_format: config.output_format,
    include_sources: config.include_sources,
  };

  if (config.mode === "exam") {
    requestConfig.num_questions = config.num_questions;
    if (config.difficulty) requestConfig.difficulty = config.difficulty;
    if (config.question_type) requestConfig.question_type = config.question_type;
  }

  if (config.mode === "study_plan" || config.mode === "summary" || config.mode === "exam") {
    if (config.chapter) requestConfig.chapter = config.chapter;
  }

  if (config.mode === "summary" && config.section) {
    requestConfig.section = config.section;
  }

  return { content, config: requestConfig };
}
