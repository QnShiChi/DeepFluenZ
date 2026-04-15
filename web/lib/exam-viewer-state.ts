import type { ExamAttempt, ExamMode } from "./exam-types.ts";

export function answersHiddenBeforeSubmit(mode: ExamMode, submitted: boolean): boolean {
  return mode === "timed" && !submitted;
}

export function canRevealQuestionFeedback(
  mode: ExamMode,
  attempt: ExamAttempt | null,
): boolean {
  if (!attempt?.score_report) return false;
  if (mode === "practice") return true;
  return attempt.status === "graded";
}

export function shouldShowScoreReport(
  mode: ExamMode,
  attempt: ExamAttempt | null,
  submitted: boolean,
): boolean {
  if (!submitted) return false;
  if (!attempt) return false;
  if (mode === "practice") return Boolean(attempt.score_report);
  return attempt.status === "graded";
}
