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

  const currentQuestion = examArtifact.questions[currentIndex];
  const submitted = attempt?.status === "graded";
  const hideAnswers = answersHiddenBeforeSubmit(examArtifact.mode, Boolean(submitted));
  const revealFeedback = canRevealQuestionFeedback(examArtifact.mode, attempt);
  const showScoreReport = shouldShowScoreReport(examArtifact.mode, attempt, Boolean(submitted));

  async function handleSubmit() {
    setBusy(true);
    try {
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
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
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
            {currentQuestion.kind}
          </p>
          <p className="text-sm font-medium text-[var(--foreground)]">{currentQuestion.prompt}</p>
        </div>

        <QuestionInputs
          question={currentQuestion}
          value={answers[currentQuestion.question_id] ?? {}}
          onChange={(next) =>
            setAnswers((prev) => ({ ...prev, [currentQuestion.question_id]: next }))
          }
          disabled={Boolean(submitted)}
        />

        {!hideAnswers && revealFeedback && attempt?.score_report ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--muted-foreground)]">
            {attempt.score_report.question_results.find(
              (result) => result.question_id === currentQuestion.question_id,
            )?.feedback || ""}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
            className="rounded-lg bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-50"
          >
            Previous
          </button>
          {!submitted ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmit()}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Submitting..." : "Submit test"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={currentIndex >= examArtifact.questions.length - 1}
            onClick={() =>
              setCurrentIndex((value) => Math.min(examArtifact.questions.length - 1, value + 1))
            }
            className="rounded-lg bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-50"
          >
            Next
          </button>
        </div>

        {showScoreReport ? (
          <ExamScoreReport
            scoreReport={attempt?.score_report ?? null}
            questions={examArtifact.questions}
            onCreateStudyPlan={
              attempt && onCreateStudyPlan
                ? () => {
                    onCreateStudyPlan(attempt);
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}
