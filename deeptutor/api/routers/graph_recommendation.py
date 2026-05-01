from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation
from deeptutor.services.graph.recommendation import recommend_next_graph_node
from deeptutor.services.graph.timeline import (
    build_learning_event,
    current_learning_event_timestamp,
    should_emit_recommendation_event,
    summarize_recommendation_change,
    timeline_reason_tags_from_recommendation,
)
from deeptutor.services.session.sqlite_store import SQLiteSessionStore, get_sqlite_session_store

router = APIRouter()


@router.get("/graph/recommendation/{course_id}", response_model=GraphRecommendation)
async def get_graph_recommendation(
    course_id: str,
    session_id: str,
    store: SQLiteSessionStore = Depends(get_sqlite_session_store),
) -> GraphRecommendation:
    template = await store.get_course_template(course_id)
    if not template:
        raise HTTPException(status_code=404, detail="Course template not found")

    state = await store.get_student_state(session_id, course_id)
    if not state:
        state = {
            "current_node_id": "",
            "mastered_nodes": [],
            "explored_nodes": [],
            "dynamic_nodes": [],
        }

    gate = await store.get_graph_adaptive_gate(course_id)
    if gate and gate.get("status") == "adaptive_blocked":
        recommendation = GraphRecommendation(
            recommended_node_id="",
            mode="review",
            score=0.0,
            reason_codes=["needs_review_before_advance"],
            backup_node_ids=[],
        )
        await _append_recommendation_event_if_needed(store, session_id, course_id, recommendation)
        return recommendation

    graph = CourseKnowledgeGraph.model_validate(json.loads(template["template_json"]))
    recommendation = recommend_next_graph_node(graph=graph, student_state=state)
    await _append_recommendation_event_if_needed(store, session_id, course_id, recommendation)
    return recommendation


async def _append_recommendation_event_if_needed(
    store: SQLiteSessionStore,
    session_id: str,
    course_id: str,
    recommendation: GraphRecommendation,
) -> None:
    current_snapshot = recommendation.model_dump()
    previous_events = await store.get_learning_timeline(
        course_id,
        category="recommendation",
        limit=1,
    )
    previous_snapshot: dict[str, object] | None = None
    if previous_events:
        details = previous_events[0].get("details") or {}
        if isinstance(details, dict):
            previous_snapshot = {
                "recommended_node_id": details.get("recommended_node_id", ""),
                "mode": details.get("recommendation_mode", details.get("mode", "")),
                "reason_codes": list(details.get("reason_codes") or []),
            }

    if not should_emit_recommendation_event(previous_snapshot, current_snapshot):
        return

    created_at = current_learning_event_timestamp()
    await store.append_learning_timeline_event(
        build_learning_event(
            event_id=f"recommendation:{course_id}:{created_at}",
            session_id=session_id,
            course_id=course_id,
            node_id=recommendation.recommended_node_id,
            category="recommendation",
            event_type="recommendation_changed",
            summary=summarize_recommendation_change(current_snapshot),
            reason_tags=timeline_reason_tags_from_recommendation(
                list(recommendation.reason_codes),
                mode=recommendation.mode,
            ),
            details={
                "recommendation_mode": recommendation.mode,
                "recommended_node_id": recommendation.recommended_node_id,
                "backup_node_ids": list(recommendation.backup_node_ids),
                "reason_codes": list(recommendation.reason_codes),
                "score": recommendation.score,
            },
            actions=(
                [
                    {
                        "kind": "open_recommendation_target",
                        "label": "Di toi buoc duoc de xuat",
                        "payload": {"node_id": recommendation.recommended_node_id},
                    }
                ]
                if recommendation.recommended_node_id
                else []
            ),
            highlighted=True,
            created_at=created_at,
        ).model_dump()
    )
