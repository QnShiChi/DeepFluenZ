from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from deeptutor.services.exam.grading import grade_attempt
from deeptutor.services.session import get_sqlite_session_store

router = APIRouter()


class CreateExamAttemptRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    exam_artifact: dict


class UpdateExamAttemptRequest(BaseModel):
    answers: list[dict] = Field(default_factory=list)


@router.post("/exam-attempts", status_code=201)
async def create_exam_attempt(payload: CreateExamAttemptRequest):
    store = get_sqlite_session_store()
    session = await store.get_session(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    artifact = await store.create_exam_artifact(payload.exam_artifact)
    attempt = await store.create_exam_attempt(
        artifact["exam_id"],
        payload.session_id,
        {"status": "in_progress", "answers": [], "score_report": None},
    )
    return {"attempt": attempt, "exam_artifact": artifact}


@router.patch("/exam-attempts/{attempt_id}")
async def update_exam_attempt(attempt_id: str, payload: UpdateExamAttemptRequest):
    store = get_sqlite_session_store()
    updated = await store.update_exam_attempt_answers(attempt_id, payload.answers)
    if updated is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    return {"attempt": updated}


@router.post("/exam-attempts/{attempt_id}/submit")
async def submit_exam_attempt(attempt_id: str):
    store = get_sqlite_session_store()
    attempt = await store.get_exam_attempt(attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    artifact = await store.get_exam_artifact(attempt["exam_id"])
    if artifact is None:
        raise HTTPException(status_code=404, detail="Exam artifact not found")
    report = grade_attempt(artifact, attempt)
    updated = await store.finalize_exam_attempt(attempt_id, report)
    if updated is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    return {"attempt": updated}


@router.get("/exam-attempts/{attempt_id}")
async def get_exam_attempt(attempt_id: str):
    store = get_sqlite_session_store()
    attempt = await store.get_exam_attempt(attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    return {"attempt": attempt}


@router.get("/sessions/{session_id}/exam-attempts")
async def list_session_exam_attempts(session_id: str):
    store = get_sqlite_session_store()
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    attempts = await store.list_exam_attempts_for_session(session_id)
    return {"attempts": attempts}
