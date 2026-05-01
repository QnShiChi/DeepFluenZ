from __future__ import annotations

from datetime import datetime, timezone

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


def current_learning_event_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def summarize_recommendation_change(recommendation: dict[str, object]) -> str:
    mode = str(recommendation.get("mode") or "")
    if mode == "remediate":
        return "He thong doi buoc tiep theo de ban on lai phan con yeu."
    if mode == "review":
        return "He thong tam dung tien len de ban xem lai nen tang."
    return "He thong da cap nhat buoc hoc tiep theo phu hop nhat."


def timeline_reason_tags_from_recommendation(
    reason_codes: list[str],
    *,
    mode: str,
) -> list[str]:
    tags: list[str] = []
    for code in reason_codes:
        if code == "prerequisites_ready":
            tags.append("prerequisite_ready")
        elif code == "recent_quiz_weakness":
            tags.append("recent_weakness")
        elif code == "needs_review_before_advance":
            tags.append("remediation_active")
        elif code in {"high_unlock_value", "close_to_current_path"}:
            tags.append("advanced_to_next")
    if mode == "remediate" and "remediation_active" not in tags:
        tags.append("remediation_active")
    # Preserve order while removing duplicates.
    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped
