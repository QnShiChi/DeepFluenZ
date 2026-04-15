import type { ExamArtifact, ExamAttempt, ExamAttemptAnswer } from "./exam-types.ts";

function examApiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE is not configured. Please set it in your environment and restart.",
    );
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}${normalizedPath}`;
}

async function expectJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function buildChoiceResponse(choiceIds: string[]) {
  return { choice_ids: choiceIds };
}

export function materializeExamAttemptAnswers(
  draftAnswers: Record<string, Record<string, unknown>>,
  answeredAt = Date.now(),
): ExamAttemptAnswer[] {
  return Object.entries(draftAnswers).map(([questionId, response]) => ({
    question_id: questionId,
    response,
    answered_at: answeredAt,
  }));
}

export async function createExamAttempt(payload: {
  sessionId: string;
  examArtifact: ExamArtifact | Record<string, unknown>;
}): Promise<{ attempt: ExamAttempt; exam_artifact: ExamArtifact }> {
  const response = await fetch(examApiUrl("/api/v1/exam-attempts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: payload.sessionId,
      exam_artifact: payload.examArtifact,
    }),
  });
  return expectJson<{ attempt: ExamAttempt; exam_artifact: ExamArtifact }>(response);
}

export async function updateExamAttempt(
  attemptId: string,
  answers: ExamAttemptAnswer[],
): Promise<{ attempt: ExamAttempt }> {
  const response = await fetch(examApiUrl(`/api/v1/exam-attempts/${attemptId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  return expectJson<{ attempt: ExamAttempt }>(response);
}

export async function submitExamAttempt(
  attemptId: string,
): Promise<{ attempt: ExamAttempt }> {
  const response = await fetch(examApiUrl(`/api/v1/exam-attempts/${attemptId}/submit`), {
    method: "POST",
  });
  return expectJson<{ attempt: ExamAttempt }>(response);
}
