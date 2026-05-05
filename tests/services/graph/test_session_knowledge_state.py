from deeptutor.services.graph.models import SessionKnowledgeState
from deeptutor.services.graph.session_knowledge_state import (
    apply_knowledge_signal,
    build_knowledge_signal,
    evaluate_next_step_decision,
)


def test_apply_knowledge_signal_updates_scores_for_quiz_failure() -> None:
    state = SessionKnowledgeState.model_validate(
        {
            "session_id": "session-1",
            "course_id": "intro-ai",
            "active_node_id": "topic_search",
            "nodes": {},
        }
    )

    signal = build_knowledge_signal(
        signal_type="quiz_failed",
        node_id="topic_search",
        score_ratio=0.33,
        metadata={"weak_concepts": ["state_space"]},
    )
    updated = apply_knowledge_signal(state, signal)
    node_state = updated.nodes["topic_search"]

    assert round(node_state.mastery_score, 2) == -0.35
    assert round(node_state.stuck_score, 2) == 0.25
    assert node_state.last_outcome == "fail"


def test_evaluate_next_step_decision_prefers_prerequisite_fallback_when_risk_is_high() -> None:
    state = SessionKnowledgeState.model_validate(
        {
            "session_id": "session-1",
            "course_id": "intro-ai",
            "active_node_id": "topic_search",
            "nodes": {
                "topic_search": {
                    "mastery_score": -0.4,
                    "stuck_score": 0.55,
                    "prerequisite_risk": 0.85,
                    "confidence_score": 0.2,
                    "attempt_count": 2,
                    "hint_count": 1,
                    "last_outcome": "fail",
                    "recent_signals": ["quiz_failed", "remediation_failed"],
                }
            },
        }
    )

    decision = evaluate_next_step_decision(
        state,
        target_node_id="topic_search",
        prerequisite_node_id="topic_intro",
        recommended_next_node_id="topic_planning",
    )

    assert decision.action == "fallback_to_prerequisite"
    assert decision.target_node_id == "topic_intro"
    assert "prerequisite_risk_high" in decision.reason_tags
