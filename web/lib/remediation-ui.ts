export function describeRemediationCtaSet(): string[] {
  return ["Ôn lại phần yếu", "Làm lại quiz", "Quay lại graph"];
}

export function describeRemediationStateBadge(status: string): string {
  if (status === "passed_mini_quiz") return "Sẵn sàng kiểm tra lại";
  return "Cần ôn lại";
}

export function getGraphQuizPassThreshold(questionCount: number): number {
  if (questionCount <= 3) return 2;
  if (questionCount <= 5) return 4;
  return 5;
}

export function didPassGraphQuiz(correctCount: number, questionCount: number): boolean {
  if (questionCount <= 0) return false;
  return correctCount >= getGraphQuizPassThreshold(questionCount);
}
