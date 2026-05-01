from __future__ import annotations

from fastapi import APIRouter, Query

from deeptutor.services.session import get_sqlite_session_store

router = APIRouter()


@router.get("/timeline/{course_id}")
async def get_graph_timeline(
    course_id: str,
    category: str = Query(default=""),
    node_id: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, object]:
    store = get_sqlite_session_store()
    return {
        "course_id": course_id,
        "events": await store.get_learning_timeline(
            course_id,
            category=category,
            node_id=node_id,
            limit=limit,
        ),
    }
