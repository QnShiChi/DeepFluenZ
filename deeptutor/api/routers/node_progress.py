"""
Node Progress API
=================

Track student progress on Knowledge Graph nodes (explored / mastered).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deeptutor.services.session import get_sqlite_session_store

router = APIRouter()


class MarkProgressRequest(BaseModel):
    session_id: str
    course_id: str
    node_id: str
    status: str  # "explored" | "mastered"


class MarkProgressResponse(BaseModel):
    success: bool


class NodeProgressResponse(BaseModel):
    progress: dict[str, str]  # {node_id: "explored" | "mastered"}


@router.post("/graph/node-progress", response_model=MarkProgressResponse)
async def mark_node_progress(req: MarkProgressRequest):
    if req.status not in ("explored", "mastered"):
        raise HTTPException(status_code=400, detail="status must be 'explored' or 'mastered'")
    store = get_sqlite_session_store()
    ok = await store.mark_node_progress(req.session_id, req.course_id, req.node_id, req.status)
    return MarkProgressResponse(success=ok)


@router.get("/graph/node-progress/{course_id}", response_model=NodeProgressResponse)
async def get_node_progress(course_id: str, session_id: str):
    store = get_sqlite_session_store()
    progress = await store.get_node_progress(session_id, course_id)
    return NodeProgressResponse(progress=progress)
