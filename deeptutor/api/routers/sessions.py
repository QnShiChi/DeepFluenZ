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
    mark_remediation_mini_quiz_failed,
    mark_remediation_mini_quiz_passed,
    resolve_remediation_target,
)
from deeptutor.services.graph.timeline import build_learning_event, current_learning_event_timestamp
from deeptutor.services.session import get_sqlite_session_store

logger = logging.getLogger(__name__)

router = APIRouter()


class SessionRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


class QuizResultItem(BaseModel):
    question_id: str = ""
    notebook_question_id: str = ""
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
        notebook_items = []
        for item in payload.answers:
            notebook_item = item.model_dump()
            notebook_question_id = (item.notebook_question_id or "").strip()
            if notebook_question_id:
                notebook_item["question_id"] = notebook_question_id
            notebook_items.append(notebook_item)
        notebook_count = await store.upsert_notebook_entries(
            session_id,
            notebook_items,
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
            state = await store.get_student_state(session_id, course_id) or {
                "current_node_id": "",
                "mastered_nodes": [],
                "explored_nodes": [],
                "weak_node_ids": [],
                "dynamic_nodes": [],
                "active_remediation": None,
                "remediation_cache": {},
            }
            previous_active_remediation = state.get("active_remediation")
            event_created_at = current_learning_event_timestamp()

            if quiz_kind == "remediation_quiz":
                passed = correct >= pass_threshold
                state = (
                    mark_remediation_mini_quiz_passed(state, score_ratio=score_ratio)
                    if passed
                    else mark_remediation_mini_quiz_failed(state, score_ratio=score_ratio)
                )
                await store.upsert_student_state(session_id, course_id, state)
                graph_updated = True
                if passed:
                    await store.append_learning_timeline_event(
                        build_learning_event(
                            event_id=f"remediation-mini-pass:{session_id}:{node_id}:{event_created_at}",
                            session_id=session_id,
                            course_id=course_id,
                            node_id=node_id,
                            category="remediation",
                            event_type="remediation_mini_quiz_passed",
                            summary="Ban da vuot qua buoc kiem tra on lai ngan.",
                            reason_tags=["remediation_active"],
                            details={
                                "score_ratio": score_ratio,
                                "pass_threshold": pass_threshold,
                                "quiz_kind": quiz_kind,
                            },
                            actions=[
                                {
                                    "kind": "retry_quiz",
                                    "label": "Lam lai quiz",
                                    "payload": {"node_id": node_id},
                                }
                            ],
                            highlighted=True,
                            created_at=event_created_at,
                        ).model_dump()
                    )
            else:
                mastery_threshold = (pass_threshold / question_count) if question_count else 1.0
                graph_updated = await store.record_graph_quiz_outcome(
                    session_id,
                    course_id,
                    node_id,
                    score_ratio,
                    mastery_threshold=mastery_threshold,
                )
                state = await store.get_student_state(session_id, course_id) or state
                template = await store.get_course_template(course_id)
                graph = None
                if template and isinstance(template.get("template_json"), str):
                    graph = CourseKnowledgeGraph.model_validate(json.loads(template["template_json"]))

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

                await store.append_learning_timeline_event(
                    build_learning_event(
                        event_id=f"quiz:{session_id}:{node_id}:{event_created_at}",
                        session_id=session_id,
                        course_id=course_id,
                        node_id=node_id,
                        category="quiz",
                        event_type="quiz_passed" if passed else "quiz_failed",
                        summary=(
                            "Ban da vuot qua quiz cua node nay."
                            if passed
                            else "Ban chua vuot qua quiz cua node nay."
                        ),
                        reason_tags=["retry_passed"] if passed and previous_active_remediation else ["recent_weakness"] if not passed else [],
                        details={
                            "score_ratio": score_ratio,
                            "pass_threshold": pass_threshold,
                            "quiz_kind": quiz_kind,
                        },
                        actions=(
                            []
                            if passed
                            else [
                                {
                                    "kind": "start_remediation",
                                    "label": "On lai phan yeu",
                                    "payload": {
                                        "node_id": str((state.get("active_remediation") or {}).get("target_node_id") or node_id),
                                    },
                                }
                            ]
                        ),
                        highlighted=True,
                        created_at=event_created_at,
                    ).model_dump()
                )

                if passed:
                    await store.append_learning_timeline_event(
                        build_learning_event(
                            event_id=f"node-mastered:{session_id}:{node_id}:{event_created_at}",
                            session_id=session_id,
                            course_id=course_id,
                            node_id=node_id,
                            category="node",
                            event_type="node_mastered",
                            summary="Ban da hoan thanh node nay.",
                            reason_tags=["advanced_to_next"],
                            details={"source": "quiz_result"},
                            actions=[{"kind": "focus_node", "label": "Xem node", "payload": {"node_id": node_id}}],
                            highlighted=True,
                            created_at=event_created_at,
                        ).model_dump()
                    )
                    if previous_active_remediation:
                        await store.append_learning_timeline_event(
                            build_learning_event(
                                event_id=f"remediation-complete:{session_id}:{node_id}:{event_created_at}",
                                session_id=session_id,
                                course_id=course_id,
                                node_id=node_id,
                                category="remediation",
                                event_type="remediation_completed",
                                summary="Ban da hoan tat vong on lai cho node nay.",
                                reason_tags=["remediation_cleared"],
                                details={
                                    "score_ratio": score_ratio,
                                    "active_remediation_status": "completed",
                                },
                                actions=[{"kind": "focus_node", "label": "Xem node", "payload": {"node_id": node_id}}],
                                highlighted=True,
                                created_at=event_created_at,
                            ).model_dump()
                        )
                else:
                    active_remediation = state.get("active_remediation") or {}
                    if active_remediation:
                        remediation_created_at = current_learning_event_timestamp()
                        await store.append_learning_timeline_event(
                            build_learning_event(
                                event_id=f"remediation-recommended:{session_id}:{node_id}:{remediation_created_at}",
                                session_id=session_id,
                                course_id=course_id,
                                node_id=str(active_remediation.get("target_node_id") or node_id),
                                category="remediation",
                                event_type="remediation_recommended",
                                summary="He thong de xuat on lai phan nen tang truoc khi tiep tuc.",
                                reason_tags=["recent_weakness", "remediation_active"],
                                details={
                                    "source_node_id": node_id,
                                    "target_node_id": str(active_remediation.get("target_node_id") or node_id),
                                    "failure_severity": str(active_remediation.get("failure_severity") or ""),
                                    "weak_concepts": list(active_remediation.get("weak_concepts") or []),
                                },
                                actions=[
                                    {
                                        "kind": "start_remediation",
                                        "label": "On lai phan yeu",
                                        "payload": {
                                            "node_id": str(active_remediation.get("target_node_id") or node_id),
                                        },
                                    }
                                ],
                                highlighted=True,
                                created_at=remediation_created_at,
                            ).model_dump()
                        )
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
