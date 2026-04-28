from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ValidationError

from deeptutor.services.graph.models import (
    CourseKnowledgeGraph,
    GraphQaFixChangeType,
    GraphQaReport,
)
from deeptutor.services.graph.qa import analyze_course_graph
from deeptutor.services.graph.qa_authoring import apply_graph_fix
from deeptutor.services.session import get_sqlite_session_store

router = APIRouter()


class FixApplyPayload(BaseModel):
    fix_id: str


class FixDraftPayload(BaseModel):
    fix_ids: list[str] = Field(default_factory=list)


class GraphQaDraftChange(BaseModel):
    change_id: str
    fix_id: str
    change_type: GraphQaFixChangeType
    preview: dict[str, object] = Field(default_factory=dict)


class GraphQaDraft(BaseModel):
    course_id: str
    changes: list[GraphQaDraftChange] = Field(default_factory=list)


def _load_course_graph(template: dict[str, object] | None) -> CourseKnowledgeGraph:
    if not template:
        raise HTTPException(status_code=404, detail="Course graph not found")

    template_json = template.get("template_json")
    if not isinstance(template_json, str):
        raise HTTPException(status_code=500, detail="Stored course graph is invalid")

    try:
        return CourseKnowledgeGraph.model_validate(json.loads(template_json))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Stored course graph is invalid") from exc


def _load_graph_qa_report(report: dict[str, object] | None) -> GraphQaReport:
    if not report:
        raise HTTPException(status_code=404, detail="Graph QA report not found")

    try:
        return GraphQaReport.model_validate(report)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": "Stored Graph QA report is invalid", "errors": exc.errors()},
        ) from exc


def _load_graph_qa_draft(draft: dict[str, object] | None) -> GraphQaDraft:
    if not draft:
        raise HTTPException(status_code=404, detail="Graph QA draft not found")

    try:
        return GraphQaDraft.model_validate(draft)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": "Stored Graph QA draft is invalid", "errors": exc.errors()},
        ) from exc


def _apply_validated_fix(
    graph: CourseKnowledgeGraph,
    fix: dict[str, object],
    *,
    failure_detail: str,
) -> CourseKnowledgeGraph:
    try:
        updated_graph = apply_graph_fix(graph, fix)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if updated_graph.model_dump() == graph.model_dump():
        raise HTTPException(status_code=409, detail=failure_detail)
    return updated_graph


@router.post("/qa/analyze/{course_id}")
async def analyze_graph_qa(course_id: str):
    store = get_sqlite_session_store()
    graph = _load_course_graph(await store.get_course_template(course_id))
    report = analyze_course_graph(graph)
    await store.save_graph_qa_report(course_id, report.model_dump())
    return report.model_dump()


@router.get("/qa/{course_id}")
async def get_graph_qa_report(course_id: str):
    report = _load_graph_qa_report(await get_sqlite_session_store().get_graph_qa_report(course_id))
    return report.model_dump()


@router.post("/qa/fixes/{course_id}/apply")
async def apply_graph_qa_fix(course_id: str, payload: FixApplyPayload):
    store = get_sqlite_session_store()
    graph = _load_course_graph(await store.get_course_template(course_id))
    report = _load_graph_qa_report(await store.get_graph_qa_report(course_id))
    fix = next((item for item in report.suggested_fixes if item.fix_id == payload.fix_id), None)
    if fix is None:
        raise HTTPException(status_code=404, detail="Graph QA fix not found")

    updated_graph = _apply_validated_fix(
        graph,
        fix.model_dump(),
        failure_detail=f"Graph QA fix '{payload.fix_id}' no longer applies to the current graph",
    )
    await store.upsert_course_template(
        course_id,
        json.dumps(updated_graph.model_dump(), ensure_ascii=False),
    )
    updated_report = analyze_course_graph(updated_graph)
    await store.save_graph_qa_report(course_id, updated_report.model_dump())
    return updated_report.model_dump()


@router.post("/qa/fixes/{course_id}/draft")
async def stage_graph_qa_fixes(course_id: str, payload: FixDraftPayload):
    store = get_sqlite_session_store()
    report = _load_graph_qa_report(await store.get_graph_qa_report(course_id))
    staged = [
        {
            "change_id": f"change_{fix.fix_id}",
            "fix_id": fix.fix_id,
            "change_type": fix.change_type,
            "preview": fix.preview,
        }
        for fix in report.suggested_fixes
        if fix.fix_id in payload.fix_ids and fix.safe_for_bulk_apply
    ]
    draft = {"course_id": course_id, "changes": staged}
    await store.save_graph_qa_draft(course_id, draft)
    return draft


@router.post("/qa/draft/{course_id}/commit")
async def commit_graph_qa_draft(course_id: str):
    store = get_sqlite_session_store()
    draft = _load_graph_qa_draft(await store.get_graph_qa_draft(course_id))
    graph = _load_course_graph(await store.get_course_template(course_id))
    updated_graph = graph
    for change in draft.changes:
        updated_graph = _apply_validated_fix(
            updated_graph,
            {
                "change_type": change.change_type,
                "preview": change.preview,
            },
            failure_detail=f"Staged Graph QA change '{change.change_id}' can no longer be applied",
        )

    await store.upsert_course_template(
        course_id,
        json.dumps(updated_graph.model_dump(), ensure_ascii=False),
    )
    updated_report = analyze_course_graph(updated_graph)
    await store.save_graph_qa_report(course_id, updated_report.model_dump())
    await store.save_graph_qa_draft(course_id, {"course_id": course_id, "changes": []})
    return updated_report.model_dump()
