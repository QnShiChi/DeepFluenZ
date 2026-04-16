"use client";

import type { ExamQuestion, ScoreReport } from "@/lib/exam-types";

interface ExamScoreReportProps {
  scoreReport: ScoreReport;
  questions: ExamQuestion[];
  questionsAnswers: Record<string, Record<string, unknown>>;
  onCreateStudyPlan?: () => void;
}

/* -------- helpers -------- */

function getUserAnswerText(
  question: ExamQuestion | undefined,
  userAnswer: Record<string, unknown>,
): string {
  if (!question) return "N/A";
  if (question.kind === "multiple_choice") {
    const ids = (userAnswer.choice_ids as string[]) || [];
    const sv =
      (question.student_view as Record<string, unknown> | null | undefined) ||
      {};
    const choices =
      (sv.choices as Array<{ id: string; label: string }> | null | undefined) ||
      [];
    return (
      ids
        .map((id) => {
          const found = choices.find((c) => c?.id === id);
          return found ? `${id}) ${found.label}` : id;
        })
        .join(", ") || "Chưa trả lời"
    );
  }
  if (question.kind === "true_false") {
    return String(userAnswer.boolean);
  }
  if (question.kind === "short_answer") {
    return (userAnswer.text as string) || "Chưa trả lời";
  }
  return "N/A";
}

function getCorrectAnswerText(question: ExamQuestion | undefined): string {
  if (!question) return "";
  if (question.kind === "multiple_choice") {
    const ids = (question.grader_key.correct_choice_ids as string[]) || [];
    const sv =
      (question.student_view as Record<string, unknown> | null | undefined) ||
      {};
    const choices =
      (sv.choices as Array<{ id: string; label: string }> | null | undefined) ||
      [];
    return ids.map((id) => choices.find((c) => c?.id === id)?.label ?? id).join(", ");
  }
  if (question.kind === "true_false") {
    return (question.grader_key.correct_boolean as boolean) ? "Đúng" : "Sai";
  }
  if (question.kind === "short_answer") {
    return ((question.grader_key.expected_concepts as string[]) || []).join(", ");
  }
  return "";
}

/* -------- component -------- */

export default function ExamScoreReport({
  scoreReport,
  questions,
  questionsAnswers,
  onCreateStudyPlan,
}: ExamScoreReportProps) {
  const pct =
    scoreReport.max_score > 0
      ? Math.round((scoreReport.total_score / scoreReport.max_score) * 100)
      : 0;
  const correctCount = scoreReport.question_results.filter((r) => r.is_correct).length;

  return (
    <div className="space-y-6">
      {/* ---------- tổng điểm ---------- */}
      <div className="rounded-xl border border-green-200 bg-green-50/50 p-5 dark:border-green-900/40 dark:bg-green-950/20">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-green-800 dark:text-green-300">
              Kết quả bài thi
            </h3>
            <p className="text-xs text-green-600 dark:text-green-400">
              {correctCount} đúng / {scoreReport.question_results.length} câu
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-green-700 dark:text-green-300">
              {pct}%
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              {scoreReport.total_score}/{scoreReport.max_score} điểm
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-green-100 dark:bg-green-900/30">
          <div
            className="h-2 rounded-full bg-green-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* ---------- phân tích năng lực ---------- */}
      {scoreReport.competency_breakdown && scoreReport.competency_breakdown.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--foreground)]">
            Phân tích năng lực
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {scoreReport.competency_breakdown.map((comp, idx) => {
              const c = comp as Record<string, any>;
              const accuracy = (c.accuracy as number) || 0;
              const pct = accuracy * 100;
              const isHighPriority = c.priority === "high";

              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-4 text-sm ${
                    isHighPriority
                      ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20"
                      : "border-[var(--border)] bg-[var(--background)]"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-medium text-[var(--foreground)]">
                      {c.competency_tag as string}
                    </p>
                    <p className="font-bold text-[var(--muted-foreground)]">
                      {c.awarded_points as number}/{c.max_points as number}
                    </p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className={`h-1.5 rounded-full ${
                        pct < 50
                          ? "bg-red-500"
                          : pct < 80
                            ? "bg-amber-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${Math.round(pct)}%` }}
                    />
                  </div>
                  {(c.chapter || c.section) && (
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                      {c.chapter as string} {c.section ? `— ${c.section as string}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- chi tiết từng câu ---------- */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">
          Chi tiết từng câu
        </h4>
        {scoreReport.question_results.map((result, idx) => {
          const question = questions.find(
            (item) => item.question_id === result.question_id,
          );
          const userAnswer = questionsAnswers[result.question_id] || {};
          const userAnswerText = getUserAnswerText(question, userAnswer);
          const correctAnswerText = getCorrectAnswerText(question);

          return (
            <div
              key={result.question_id}
              className={`rounded-xl border p-4 ${
                result.is_correct
                  ? "border-green-200 bg-green-50/60 dark:border-green-900/40 dark:bg-green-950/10"
                  : "border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/10"
              }`}
            >
              {/* number · kind · tags + score */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${
                      result.is_correct ? "bg-green-600" : "bg-red-600"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                    {question?.kind?.replace("_", " ")}
                  </span>
                  {question?.competency_tags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p
                  className={`shrink-0 text-lg font-bold ${
                    result.is_correct ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {result.awarded_points}/{result.max_points}
                </p>
              </div>

              {/* prompt */}
              <p className="mb-3 text-sm font-medium text-[var(--foreground)]">
                {question?.prompt ?? result.question_id}
              </p>

              {/* user's answer */}
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  result.is_correct
                    ? "border-green-200 bg-green-100/30 dark:border-green-900/40"
                    : "border-red-200 bg-red-100/30 dark:border-red-900/40"
                }`}
              >
                <p
                  className={
                    result.is_correct
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-700 dark:text-red-400"
                  }
                >
                  <span className="font-medium">Câu trả lời của bạn: </span>
                  {userAnswerText}
                  {result.is_correct ? " ✅" : " ❌"}
                </p>
              </div>

              {/* wrong → correct answer + explanation */}
              {!result.is_correct && (
                <div className="mt-2 space-y-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs dark:border-green-900/40 dark:bg-green-950/20">
                  {correctAnswerText && (
                    <p className="text-green-700 dark:text-green-300/90">
                      <span className="font-medium">Đáp án đúng: </span>
                      {correctAnswerText}
                    </p>
                  )}
                  {result.feedback && (
                    <p className="text-green-700 dark:text-green-300/90">
                      <span className="font-medium">💡 Giải thích: </span>
                      {result.feedback}
                    </p>
                  )}
                </div>
              )}

              {/* correct → brief feedback */}
              {result.is_correct && result.feedback && (
                <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs dark:border-green-900/40 dark:bg-green-950/20">
                  <p className="text-green-700 dark:text-green-300/90">
                    ✅ {result.feedback}
                  </p>
                </div>
              )}

              {/* short answer → concepts */}
              {question?.kind === "short_answer" &&
                result.matched_concepts && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.matched_concepts.length > 0 && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        ✓ Có: {result.matched_concepts.join(", ")}
                      </span>
                    )}
                    {result.missing_concepts?.length > 0 && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        ✗ Thiếu: {result.missing_concepts.join(", ")}
                      </span>
                    )}
                  </div>
                )}
            </div>
          );
        })}
      </div>

      {/* ---------- recommended review ---------- */}
      {scoreReport.recommended_review &&
        scoreReport.recommended_review.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <h4 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              📚 Nội dung cần ôn tập
            </h4>
            <ul className="space-y-1">
              {scoreReport.recommended_review.map((rec, i) => {
                const r = rec as Record<string, any>;
                return (
                  <li
                    key={i}
                    className="text-sm text-amber-700 dark:text-amber-300"
                  >
                    <span className="font-medium">
                      {r.chapter ?? ""}
                      {r.section ? ` — ${r.section}` : ""}
                      {r.competency_tag ? ` (${r.competency_tag})` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            {onCreateStudyPlan && (
              <button
                type="button"
                onClick={onCreateStudyPlan}
                className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Tạo kế hoạch ôn tập từ kết quả này
              </button>
            )}
          </div>
        )}
    </div>
  );
}
