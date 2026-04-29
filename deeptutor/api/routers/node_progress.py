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
    current_node_id: str | None = None


class SetCurrentNodeRequest(BaseModel):
    session_id: str
    course_id: str
    node_id: str


class MarkProgressResponse(BaseModel):
    success: bool


class NodeProgressResponse(BaseModel):
    progress: dict[str, str]  # {node_id: "explored" | "mastered"}
    current_node_id: str = ""
    dynamic_nodes: list[dict[str, object]] = []
    active_remediation: dict[str, object] | None = None


@router.post("/graph/node-progress", response_model=MarkProgressResponse)
async def mark_node_progress(req: MarkProgressRequest):
    if req.status not in ("explored", "mastered"):
        raise HTTPException(status_code=400, detail="status must be 'explored' or 'mastered'")
    store = get_sqlite_session_store()
    ok = await store.mark_node_progress(
        req.session_id,
        req.course_id,
        req.node_id,
        req.status,
        current_node_id=req.current_node_id,
    )
    return MarkProgressResponse(success=ok)


@router.post("/graph/current-node", response_model=MarkProgressResponse)
async def set_current_node(req: SetCurrentNodeRequest):
    store = get_sqlite_session_store()
    ok = await store.set_current_graph_node(req.session_id, req.course_id, req.node_id)
    return MarkProgressResponse(success=ok)


@router.get("/graph/node-progress/{course_id}", response_model=NodeProgressResponse)
async def get_node_progress(course_id: str, session_id: str):
    store = get_sqlite_session_store()
    progress = await store.get_node_progress(session_id, course_id)
    state = await store.get_student_state(session_id, course_id)
    return NodeProgressResponse(
        progress=progress,
        current_node_id=str((state or {}).get("current_node_id", "") or ""),
        dynamic_nodes=list((state or {}).get("dynamic_nodes", []) or []),
        active_remediation=(state or {}).get("active_remediation"),
    )
