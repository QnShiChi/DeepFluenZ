"use client";

import { useState } from "react";

import {
  createExamAttempt,
  materializeExamAttemptAnswers,
  submitExamAttempt,
  updateExamAttempt,
} from "@/lib/exam-api";
import {
  answersHiddenBeforeSubmit,
  canRevealQuestionFeedback,
  shouldShowScoreReport,
} from "@/lib/exam-viewer-state";
import type { ExamArtifact, ExamAttempt } from "@/lib/exam-types";

import ExamScoreReport from "./ExamScoreReport";
import QuestionInputs from "./QuestionInputs";

interface ExamViewerProps {
  examArtifact: ExamArtifact;
  initialAttempt: ExamAttempt | null;
  sessionId: string;
  onCreateStudyPlan?: (attempt: ExamAttempt) => void;
}

export default function ExamViewer({
  examArtifact,
  initialAttempt,
  sessionId,
  onCreateStudyPlan,
}: ExamViewerProps) {
  const [attempt, setAttempt] = useState<ExamAttempt | null>(initialAttempt);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>(
    () =>
      Object.fromEntries(
        (initialAttempt?.answers ?? []).map((answer) => [answer.question_id, answer.response]),
      ),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  const submitted = attempt?.status === "graded";
  const hideAnswers = answersHiddenBeforeSubmit(examArtifact.mode, Boolean(submitted));
  const revealFeedback = canRevealQuestionFeedback(examArtifact.mode, attempt);
  const showScoreReport = shouldShowScoreReport(examArtifact.mode, attempt, Boolean(submitted));

  // Local grading
  const localOnly = !sessionId || sessionId.trim().length === 0;

  function gradeAttemptLocal() {
    let totalScore = 0;
    let maxScore = 0;
    const recommendedReview: Record<string, unknown>[] = [];

    const tagAgg: Record<string, any> = {};

    const questionResults = examArtifact.questions.map((question) => {
      const maxPts = question.points;
      maxScore += maxPts;
      const response = answers[question.question_id] || {};
      let correct = false;
      if (question.kind === "multiple_choice") {
        const a = [...((question.grader_key.correct_choice_ids as string[]) || [])].sort();
        const b = [...((response.choice_ids as string[]) || [])].sort();
        correct = JSON.stringify(a) === JSON.stringify(b);
      } else if (question.kind === "true_false") {
        correct = response.boolean === question.grader_key.correct_boolean;
      } else if (question.kind === "short_answer") {
        const text = ((response.text as string) || "").toLowerCase();
        const expected = (question.grader_key.expected_concepts as string[]) || [];
        correct = expected.some((c: string) => text.includes(c.toLowerCase()));
      }
      const points = correct ? maxPts : 0;
      totalScore += points;

      const tags = question.competency_tags || [];
      for (const tag of tags) {
        if (!tag) continue;
        if (!tagAgg[tag]) {
            tagAgg[tag] = { awarded: 0, max: 0, chapter: question.chapter || "", section: question.section || "" };
        }
        tagAgg[tag].awarded += points;
        tagAgg[tag].max += maxPts;

        if (points < maxPts) {
          const recKey = `${question.chapter || ""}|${question.section || ""}|${tag}`;
          if (!recommendedReview.some((r) => r._key === recKey)) {
            recommendedReview.push({
              _key: recKey,
              chapter: question.chapter || "",
              section: question.section || "",
              competency_tag: tag,
              priority: "high",
              reason: `Missed points on ${tag}`,
            });
          }
        }
      }

      return {
        question_id: question.question_id,
        awarded_points: points,
        max_points: maxPts,
        is_correct: correct,
        feedback: (question.grader_key.explanation as string) || "",
        confidence: 0.9,
        matched_concepts: [] as string[],
        missing_concepts: [] as string[],
      };
    });

    const competencyBreakdown = Object.entries(tagAgg).map(([tag, data]) => ({
      competency_tag: tag,
      chapter: data.chapter,
      section: data.section,
      awarded_points: data.awarded,
      max_points: data.max,
      accuracy: data.max > 0 ? data.awarded / data.max : 0,
      priority: data.awarded < data.max ? "high" : "low",
    }));
    return {
      total_score: totalScore,
      max_score: maxScore,
      question_results: questionResults,
      competency_breakdown: competencyBreakdown,
      recommended_review: recommendedReview,
    };
  }

  async function handleSubmit() {
    setBusy(true);
    try {
      if (localOnly) {
        const report = gradeAttemptLocal();
        const localAttempt = {
          attempt_id: `local_${Date.now()}`,
          exam_id: examArtifact.exam_id,
          session_id: "local",
          status: "graded" as const,
          started_at: Date.now(),
          submitted_at: Date.now(),
          duration_seconds: 0,
          answers: Object.entries(answers).map(([qid, resp]) => ({
            question_id: qid,
            response: resp,
          })),
          score_report: report,
          study_plan_link: null,
          updated_at: Date.now(),
        };
        setAttempt(localAttempt);
      } else {
        const activeAttempt =
          attempt ??
          (await createExamAttempt({
            sessionId,
            examArtifact,
          })).attempt;
        const materializedAnswers = materializeExamAttemptAnswers(answers);
        const updated = await updateExamAttempt(activeAttempt.attempt_id, materializedAnswers);
        const submittedAttempt = await submitExamAttempt(updated.attempt.attempt_id);
        setAttempt(submittedAttempt.attempt);
      }
    } catch (err) {
      console.error("[ExamViewer] Submit failed:", err);
      alert(
        err instanceof Error
          ? `Failed to submit: ${err.message}`
          : "Failed to submit. Check console for details.",
      );
    } finally {
      setBusy(false);
    }
  }

  // After submit: hide question area, show only score report
  if (submitted && attempt?.score_report) {
    return (
      <ExamScoreReport
        scoreReport={attempt.score_report}
        questions={examArtifact.questions}
        questionsAnswers={answers}
        onCreateStudyPlan={
          onCreateStudyPlan ? () => onCreateStudyPlan(attempt) : undefined
        }
      />
    );
  }

  // During exam: show question-by-question
  const currentQuestion = examArtifact.questions[currentIndex];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">{examArtifact.title}</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              {currentIndex + 1}/{examArtifact.questions.length} questions
            </p>
          </div>
          <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--foreground)]">
            {examArtifact.mode}
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* Question prompt */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            {currentQuestion.kind.replace("_", " ")}
          </p>
          <p className="text-sm font-medium text-[var(--foreground)]">{currentQuestion.prompt}</p>
        </div>

        {/* Answer inputs */}
        <QuestionInputs
          question={currentQuestion}
          value={answers[currentQuestion.question_id] ?? {}}
          onChange={(next) =>
            setAnswers((prev) => ({ ...prev, [currentQuestion.question_id]: next }))
          }
          disabled={busy}
        />

        {/* In-progress feedback (practice mode only) */}
        {!hideAnswers && revealFeedback && attempt?.score_report ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--muted-foreground)]">
            {attempt.score_report.question_results.find(
              (result) => result.question_id === currentQuestion.question_id,
            )?.feedback || ""}
          </div>
        ) : null}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
            className="rounded-lg bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-50"
          >
            ← Previous
          </button>
          {!submitted && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Submitting..." : "Submit test"}
            </button>
          )}
          <button
            type="button"
            disabled={currentIndex >= examArtifact.questions.length - 1}
            onClick={() =>
              setCurrentIndex((value) => Math.min(examArtifact.questions.length - 1, value + 1))
            }
            className="rounded-lg bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
