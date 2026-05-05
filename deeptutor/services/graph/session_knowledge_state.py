from __future__ import annotations

from deeptutor.services.graph.models import (
    KnowledgeSignal,
    NextStepDecision,
    NodeKnowledgeState,
    SessionKnowledgeState,
)


def build_knowledge_signal(
    *,
    signal_type: str,
    node_id: str,
    score_ratio: float | None = None,
    metadata: dict[str, object] | None = None,
) -> KnowledgeSignal:
    return KnowledgeSignal(
        signal_type=signal_type,
        node_id=node_id,
        score_ratio=score_ratio,
        metadata=metadata or {},
    )


def apply_knowledge_signal(
    state: SessionKnowledgeState,
    signal: KnowledgeSignal,
) -> SessionKnowledgeState:
    updated = state.model_copy(deep=True)
    node_state = updated.nodes.get(signal.node_id, NodeKnowledgeState()).model_copy(deep=True)

    if signal.signal_type == "quiz_failed":
        node_state.mastery_score = max(-1.0, node_state.mastery_score - 0.35)
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.25)
        node_state.attempt_count += 1
        node_state.last_outcome = "fail"
    elif signal.signal_type == "quiz_passed":
        node_state.mastery_score = min(1.0, node_state.mastery_score + 0.4)
        node_state.stuck_score = max(0.0, node_state.stuck_score - 0.2)
        node_state.confidence_score = min(1.0, node_state.confidence_score + 0.2)
        node_state.last_outcome = "pass"
    elif signal.signal_type == "hint_requested":
        node_state.hint_count += 1
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.1)
        node_state.confidence_score = max(0.0, node_state.confidence_score - 0.1)
    elif signal.signal_type == "retry_requested":
        node_state.attempt_count += 1
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.15)
    elif signal.signal_type == "remediation_failed":
        node_state.prerequisite_risk = min(1.0, node_state.prerequisite_risk + 0.25)
        node_state.stuck_score = min(1.0, node_state.stuck_score + 0.2)
        node_state.last_outcome = "fail"
    elif signal.signal_type == "remediation_completed":
        node_state.mastery_score = min(1.0, node_state.mastery_score + 0.3)
        node_state.prerequisite_risk = max(0.0, node_state.prerequisite_risk - 0.2)
        node_state.confidence_score = min(1.0, node_state.confidence_score + 0.15)
        node_state.last_outcome = "remediated"

    node_state.recent_signals = [*node_state.recent_signals[-4:], signal.signal_type]
    updated.nodes[signal.node_id] = node_state
    updated.active_node_id = signal.node_id
    return updated


def evaluate_next_step_decision(
    state: SessionKnowledgeState,
    *,
    target_node_id: str,
    prerequisite_node_id: str = "",
    recommended_next_node_id: str = "",
) -> NextStepDecision:
    node_state = state.nodes.get(target_node_id, NodeKnowledgeState())

    if node_state.prerequisite_risk >= 0.8 and prerequisite_node_id:
        return NextStepDecision(
            action="fallback_to_prerequisite",
            target_node_id=prerequisite_node_id,
            reason_tags=["prerequisite_risk_high", "recent_failure"],
            explanation_summary="He thong de xuat quay lai node tien quyet gan nhat.",
        )
    if node_state.stuck_score >= 0.65:
        return NextStepDecision(
            action="start_targeted_remediation",
            target_node_id=target_node_id,
            reason_tags=["retry_loop_detected", "recent_failure"],
            explanation_summary="He thong de xuat on lai phan yeu truoc khi di tiep.",
        )
    if node_state.mastery_score >= 0.45 and recommended_next_node_id:
        return NextStepDecision(
            action="advance",
            target_node_id=recommended_next_node_id,
            reason_tags=["mastery_high", "ready_to_advance"],
            explanation_summary="Ban da san sang chuyen sang buoc tiep theo.",
        )
    return NextStepDecision(
        action="give_micro_quiz",
        target_node_id=target_node_id,
        reason_tags=["mastery_uncertain"],
        explanation_summary="Lam them mot bai kiem tra ngan de xac nhan muc do hieu bai.",
    )
