export type ExamMode = "timed" | "practice";
export type QuestionKind =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "matching";

export interface ExamQuestion {
  question_id: string;
  kind: QuestionKind;
  prompt: string;
  points: number;
  chapter: string;
  section: string;
  competency_tags: string[];
  difficulty: string;
  student_view: Record<string, unknown>;
  grader_key: Record<string, unknown>;
}

export interface ExamArtifact {
  exam_id: string;
  title: string;
  mode: ExamMode;
  source_session_id: string;
  knowledge_base: string;
  total_points: number;
  questions: ExamQuestion[];
}

export interface ExamAttemptAnswer {
  question_id: string;
  response: Record<string, unknown>;
  answered_at?: number;
}

export interface ScoreReportQuestionResult {
  question_id: string;
  awarded_points: number;
  max_points: number;
  is_correct: boolean;
  feedback: string;
  confidence: number;
  matched_concepts: string[];
  missing_concepts: string[];
}

export interface ScoreReport {
  total_score: number;
  max_score: number;
  question_results: ScoreReportQuestionResult[];
  competency_breakdown: Array<Record<string, unknown>>;
  recommended_review: Array<Record<string, unknown>>;
}

export interface ExamAttempt {
  attempt_id: string;
  exam_id: string;
  session_id: string;
  status: "in_progress" | "submitted" | "grading" | "graded";
  answers: ExamAttemptAnswer[];
  score_report: ScoreReport | null;
  study_plan_link?: Record<string, unknown> | null;
  started_at?: number;
  submitted_at?: number | null;
  duration_seconds?: number;
  updated_at?: number;
}
