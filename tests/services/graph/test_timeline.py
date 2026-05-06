from deeptutor.services.graph.models import LearningTimelineEvent
from deeptutor.services.graph.timeline import (
    build_learning_event,
    should_emit_recommendation_event,
    summarize_recommendation_change,
    timeline_reason_tags_from_recommendation,
)


def test_build_learning_event_preserves_summary_tags_and_actions() -> None:
    event = build_learning_event(
        event_id="evt_1",
        session_id="session_1",
        course_id="oop_course",
        node_id="oop_intro",
        category="quiz",
        event_type="quiz_failed",
        summary="Ban chua vuot qua quiz cua node nay.",
        reason_tags=["recent_weakness", "remediation_active"],
        details={"score_ratio": 0.4, "failure_severity": "severe"},
        actions=[{"kind": "start_remediation", "label": "On lai phan yeu"}],
        highlighted=True,
        created_at="2026-04-29T09:00:00Z",
    )

    assert isinstance(event, LearningTimelineEvent)
    assert event.category == "quiz"
    assert event.reason_tags == ["recent_weakness", "remediation_active"]
    assert event.actions[0].kind == "start_remediation"
    assert event.highlighted is True


def test_should_emit_recommendation_event_requires_meaningful_change() -> None:
    previous = {
        "recommended_node_id": "oop_intro",
        "mode": "advance",
        "reason_codes": ["prerequisites_ready"],
    }
    current = {
        "recommended_node_id": "oop_intro",
        "mode": "advance",
        "reason_codes": ["prerequisites_ready"],
    }
    changed = {
        "recommended_node_id": "oop_review",
        "mode": "remediate",
        "reason_codes": ["recent_quiz_weakness"],
    }

    assert should_emit_recommendation_event(previous, current) is False
    assert should_emit_recommendation_event(previous, changed) is True


def test_timeline_reason_tags_from_recommendation_maps_review_reason_codes() -> None:
    tags = timeline_reason_tags_from_recommendation(
        ["needs_review_before_advance", "forgetting_risk_high"],
        mode="review",
    )

    assert tags == ["review_due", "forgetting_risk_high"]
    assert "xem lai" in summarize_recommendation_change(
        {"mode": "review", "reason_codes": ["needs_review_before_advance"]}
    ).lower()
