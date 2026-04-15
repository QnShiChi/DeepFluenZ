"use client";

import type { ExamQuestion, ScoreReport } from "@/lib/exam-types";

interface ExamScoreReportProps {
  scoreReport: ScoreReport | null;
  questions: ExamQuestion[];
  onCreateStudyPlan?: () => void;
}

export default function ExamScoreReport({
  scoreReport,
  questions,
  onCreateStudyPlan,
}: ExamScoreReportProps) {
  if (!scoreReport) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Score report</h3>
        <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--foreground)]">
          {scoreReport.total_score}/{scoreReport.max_score}
        </span>
      </div>

      <div className="space-y-2">
        {scoreReport.question_results.map((result) => {
          const question = questions.find((item) => item.question_id === result.question_id);
          return (
            <div key={result.question_id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {question?.prompt ?? result.question_id}
                </p>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {result.awarded_points}/{result.max_points}
                </span>
              </div>
              {result.feedback ? (
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{result.feedback}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {scoreReport.recommended_review.length > 0 && onCreateStudyPlan ? (
        <button
          type="button"
          onClick={onCreateStudyPlan}
          className="rounded-lg bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)]"
        >
          Create study plan from this result
        </button>
      ) : null}
    </div>
  );
}
