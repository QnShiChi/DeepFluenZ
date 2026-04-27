from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation
from deeptutor.services.graph.recommendation import recommend_next_graph_node
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

    graph = CourseKnowledgeGraph.model_validate(json.loads(template["template_json"]))
    return recommend_next_graph_node(graph=graph, student_state=state)
