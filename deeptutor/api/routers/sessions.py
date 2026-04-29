"""
Unified session history API.
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, HTTPException, Query

from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.quiz_policy import (
    determine_failure_severity,
    determine_graph_quiz_pass_threshold,
)
from deeptutor.services.graph.remediation import (
    clear_completed_remediation,
    create_or_update_remediation_state,
    resolve_remediation_target,
)
from deeptutor.services.session import get_sqlite_session_store

logger = logging.getLogger(__name__)

router = APIRouter()


class SessionRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


class QuizResultItem(BaseModel):
    question_id: str = ""
    question: str = Field(..., min_length=1)
    question_type: str = ""
    options: dict[str, str] | None = None
    user_answer: str = ""
    correct_answer: str = ""
    explanation: str | None = ""
    difficulty: str | None = ""
    is_correct: bool

    @field_validator("options", mode="before")
    @classmethod
    def _coerce_options(cls, v):
        return v if isinstance(v, dict) else {}

    @field_validator("explanation", "difficulty", mode="before")
    @classmethod
    def _coerce_str(cls, v):
        return v if isinstance(v, str) else ""


class QuizResultsRequest(BaseModel):
    answers: list[QuizResultItem] = Field(default_factory=list)
    graph_context: dict[str, object] | None = None


def _format_quiz_results_message(answers: list[QuizResultItem]) -> str:
    total = len(answers)
    correct = sum(1 for item in answers if item.is_correct)
    score_pct = round((correct / total) * 100) if total else 0
    lines = ["[Quiz Performance]"]
    for idx, item in enumerate(answers, 1):
        question = item.question.strip().replace("\n", " ")
        user_answer = (item.user_answer or "").strip() or "(blank)"
        status = "Correct" if item.is_correct else "Incorrect"
        suffix = f" ({status})"
        if not item.is_correct and (item.correct_answer or "").strip():
            suffix = f" ({status}, correct: {(item.correct_answer or '').strip()})"
        qid = f"[{item.question_id}] " if item.question_id else ""
        lines.append(f"{idx}. {qid}Q: {question} -> Answered: {user_answer}{suffix}")
    lines.append(f"Score: {correct}/{total} ({score_pct}%)")
    return "\n".join(lines)


@router.get("")
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    store = get_sqlite_session_store()
    sessions = await store.list_sessions(limit=limit, offset=offset)
    return {"sessions": sessions}


@router.get("/{session_id}")
async def get_session(session_id: str):
    store = get_sqlite_session_store()
    session = await store.get_session_with_messages(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}")
async def rename_session(session_id: str, payload: SessionRenameRequest):
    store = get_sqlite_session_store()
    updated = await store.update_session_title(session_id, payload.title)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    session = await store.get_session(session_id)
    return {"session": session}


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    store = get_sqlite_session_store()
    deleted = await store.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True, "session_id": session_id}


@router.post("/{session_id}/quiz-results")
async def record_quiz_results(session_id: str, payload: QuizResultsRequest):
    if not payload.answers:
        raise HTTPException(status_code=400, detail="Quiz results are required")
    store = get_sqlite_session_store()
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    content = _format_quiz_results_message(payload.answers)
    await store.add_message(
        session_id=session_id,
        role="user",
        content=content,
        capability="deep_question",
    )
    notebook_count = 0
    try:
        notebook_count = await store.upsert_notebook_entries(
            session_id,
            [item.model_dump() for item in payload.answers],
        )
    except Exception:
        logger.warning("Failed to upsert notebook entries for session %s", session_id, exc_info=True)
    graph_updated = False
    graph_context = payload.graph_context or {}
    course_id = str(graph_context.get("course_id", "") or "").strip()
    node_id = str(graph_context.get("node_id", "") or "").strip()
    if course_id and node_id:
        try:
            correct = sum(1 for item in payload.answers if item.is_correct)
            question_count = len(payload.answers)
            score_ratio = (correct / question_count) if question_count else 0.0
            quiz_kind = str(graph_context.get("quiz_kind", "node_quiz") or "node_quiz").strip() or "node_quiz"
            pass_threshold = determine_graph_quiz_pass_threshold(question_count)
            mastery_threshold = (pass_threshold / question_count) if question_count else 1.0
            graph_updated = await store.record_graph_quiz_outcome(
                session_id,
                course_id,
                node_id,
                score_ratio,
                mastery_threshold=mastery_threshold,
            )
            if quiz_kind == "node_quiz":
                template = await store.get_course_template(course_id)
                graph = None
                if template and isinstance(template.get("template_json"), str):
                    graph = CourseKnowledgeGraph.model_validate(json.loads(template["template_json"]))

                state = await store.get_student_state(session_id, course_id) or {
                    "current_node_id": "",
                    "mastered_nodes": [],
                    "explored_nodes": [],
                    "weak_node_ids": [],
                    "dynamic_nodes": [],
                    "active_remediation": None,
                    "remediation_cache": {},
                }
                passed = correct >= pass_threshold
                question_concept_map = graph_context.get("question_concept_map")
                concept_map = question_concept_map if isinstance(question_concept_map, dict) else {}
                weak_concepts = sorted(
                    {
                        concept
                        for item in payload.answers
                        if not item.is_correct
                        for concept in (
                            concept_map.get(item.question_id, [])
                            if isinstance(concept_map.get(item.question_id, []), list)
                            else []
                        )
                        if isinstance(concept, str) and concept.strip()
                    }
                )

                if passed:
                    state = clear_completed_remediation(state, passed_node_id=node_id)
                else:
                    prerequisite_weakness = bool(graph_context.get("prerequisite_weakness"))
                    severity = determine_failure_severity(
                        score_ratio=score_ratio,
                        weak_concepts=weak_concepts,
                        prerequisite_weakness=prerequisite_weakness,
                    )
                    if graph is not None:
                        target = resolve_remediation_target(
                            graph=graph,
                            source_node_id=node_id,
                            weak_concepts=weak_concepts,
                            mastered_nodes=state.get("mastered_nodes", []) or [],
                            prerequisite_weakness=prerequisite_weakness,
                        )
                    else:
                        target = {
                            "target_node_id": node_id,
                            "weak_concepts": weak_concepts,
                        }
                    state = create_or_update_remediation_state(
                        state,
                        source_node_id=node_id,
                        target_node_id=str(target["target_node_id"]),
                        weak_concepts=list(target["weak_concepts"]),
                        failure_severity=severity,
                        score_ratio=score_ratio,
                    )
                await store.upsert_student_state(session_id, course_id, state)
        except Exception:
            logger.warning(
                "Failed to update graph quiz outcome for session %s course %s node %s",
                session_id,
                course_id,
                node_id,
                exc_info=True,
            )
    return {
        "recorded": True,
        "session_id": session_id,
        "answer_count": len(payload.answers),
        "notebook_count": notebook_count,
        "content": content,
        "graph_updated": graph_updated,
    }
