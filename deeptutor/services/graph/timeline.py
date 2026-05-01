from __future__ import annotations

from deeptutor.services.graph.models import LearningTimelineAction, LearningTimelineEvent


def build_learning_event(
    *,
    event_id: str,
    session_id: str,
    course_id: str,
    node_id: str,
    category: str,
    event_type: str,
    summary: str,
    reason_tags: list[str],
    details: dict[str, object],
    actions: list[dict[str, object]],
    highlighted: bool,
    created_at: str,
) -> LearningTimelineEvent:
    return LearningTimelineEvent.model_validate(
        {
            "event_id": event_id,
            "session_id": session_id,
            "course_id": course_id,
            "node_id": node_id,
            "category": category,
            "event_type": event_type,
            "created_at": created_at,
            "summary": summary,
            "reason_tags": reason_tags,
            "details": details,
            "actions": [LearningTimelineAction.model_validate(action) for action in actions],
            "highlighted": highlighted,
        }
    )


def should_emit_recommendation_event(
    previous: dict[str, object] | None,
    current: dict[str, object] | None,
) -> bool:
    if not current:
        return False
    if not previous:
        return True
    return (
        previous.get("recommended_node_id") != current.get("recommended_node_id")
        or previous.get("mode") != current.get("mode")
        or list(previous.get("reason_codes") or []) != list(current.get("reason_codes") or [])
    )
