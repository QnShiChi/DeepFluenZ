import type { QuizQuestion } from "@/lib/quiz-types";

type GradingQuestion = Pick<QuizQuestion, "question_type" | "options" | "correct_answer">;
type GradingAnswer = {
  selected: string | null;
  typed: string;
};

function normalizeChoice(value: string): string {
  return value.trim().toUpperCase();
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fenced) {
    return fenced[1].trim();
  }
  return trimmed;
}

function normalizeWritten(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeCoding(value: string): string {
  const unfenced = stripCodeFence(value).replace(/\r\n/g, "\n");
  return unfenced
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line, index, lines) => line !== "" || (index > 0 && index < lines.length - 1))
    .join("\n");
}

function normalizeFreeform(questionType: QuizQuestion["question_type"], value: string): string {
  if (questionType === "coding") {
    return normalizeCoding(value);
  }
  return normalizeWritten(value);
}

export function getUserAnswer(question: GradingQuestion, answer: GradingAnswer): string {
  if (
    question.question_type === "choice" &&
    question.options &&
    Object.keys(question.options).length > 0
  ) {
    return answer.selected ?? "";
  }
  return answer.typed.trim();
}

export function isQuizAnswerCorrect(question: GradingQuestion, answer: GradingAnswer): boolean {
  const userAnswer = getUserAnswer(question, answer);
  if (!userAnswer) return false;
  const correct = question.correct_answer.trim();
  const isChoice =
    question.question_type === "choice" &&
    question.options &&
    Object.keys(question.options).length > 0;
  if (isChoice) {
    const normalizedUser = normalizeChoice(userAnswer);
    const normalizedCorrect = normalizeChoice(correct);
    return (
      normalizedUser === normalizedCorrect ||
      normalizedUser === normalizedCorrect.charAt(0)
    );
  }
  return normalizeFreeform(question.question_type, userAnswer) === normalizeFreeform(question.question_type, correct);
}
