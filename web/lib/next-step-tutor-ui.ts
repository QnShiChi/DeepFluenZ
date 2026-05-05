export type NextStepDecision = {
  action:
    | "advance"
    | "stay_and_explain"
    | "give_micro_quiz"
    | "start_targeted_remediation"
    | "fallback_to_prerequisite";
  target_node_id: string;
  reason_tags: string[];
  explanation_summary: string;
};

export function describeNextStepDecision(decision: NextStepDecision) {
  const ctaByAction: Record<NextStepDecision["action"], string> = {
    advance: "Sang node tiep theo",
    stay_and_explain: "Giai thich lai ngan gon",
    give_micro_quiz: "Lam bai kiem tra ngan",
    start_targeted_remediation: "On lai phan yeu",
    fallback_to_prerequisite: "Quay lai node tien quyet",
  };

  return {
    badge: "Tutor recommendation",
    ctaLabel: ctaByAction[decision.action],
    tone:
      decision.action === "advance"
        ? "success"
        : decision.action === "give_micro_quiz"
          ? "info"
          : "warning",
    summary: decision.explanation_summary,
  };
}
