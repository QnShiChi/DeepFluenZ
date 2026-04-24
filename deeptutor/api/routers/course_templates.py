from __future__ import annotations

import json
import uuid
from typing import Any

import pdfplumber
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from deeptutor.services.graph.pipeline import build_course_knowledge_graph
from deeptutor.services.graph.validator import validate_course_knowledge_graph
from deeptutor.services.llm.client import get_llm_client
from deeptutor.services.session.sqlite_store import SQLiteSessionStore, get_sqlite_session_store

router = APIRouter(tags=["Course Templates"])


def _slugify_course_id(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-") or "course"


@router.post("/course-templates/extract-pdf")
async def extract_course_template_from_pdf(
    file: UploadFile = File(...),
    store: SQLiteSessionStore = Depends(get_sqlite_session_store),
):
    """
    Extract a course knowledge graph from an uploaded PDF syllabus.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Must upload a PDF file")

    text = ""
    try:
        with pdfplumber.open(file.file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {exc}") from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any text from the PDF")

    try:
        generated_slug = _slugify_course_id(file.filename.rsplit(".", 1)[0])
        graph = await build_course_knowledge_graph(
            source_type="syllabus_pdf",
            course_id=f"{generated_slug}-{str(uuid.uuid4())[:6]}",
            title=file.filename.rsplit(".", 1)[0],
            source_text=text,
            llm=get_llm_client(),
        )
        await store.upsert_course_template(graph.course_id, graph.model_dump_json())
        return {
            "course_id": graph.course_id,
            "import_report": graph.import_report.model_dump() if graph.import_report else None,
        }
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed AI extraction: {exc}") from exc


@router.post("/course-templates/import")
async def import_course_template(
    payload: dict[str, Any],
    store: SQLiteSessionStore = Depends(get_sqlite_session_store),
):
    """
    Import a validated course knowledge graph and upsert it into the database.
    """
    course_id = payload.get("course_id")
    session_id = payload.get("session_id")
    if not course_id:
        raise HTTPException(status_code=400, detail="Missing course_id in payload")

    try:
        graph_payload = {key: value for key, value in payload.items() if key != "session_id"}
        graph = validate_course_knowledge_graph(graph_payload)
        await store.upsert_course_template(course_id, graph.model_dump_json())
        if session_id:
            updated = await store.update_session_preferences(session_id, {"course_id": course_id})
            if not updated:
                raise HTTPException(status_code=404, detail="Session not found")
        return {
            "course_id": course_id,
            "import_report": graph.import_report.model_dump() if graph.import_report else None,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/course-templates/{course_id}")
async def get_course_template(
    course_id: str,
    store: SQLiteSessionStore = Depends(get_sqlite_session_store),
):
    """
    Fetch a JSON course knowledge graph template by course ID.
    """
    template = await store.get_course_template(course_id)
    if not template:
        raise HTTPException(status_code=404, detail="Course template not found")

    try:
        data = json.loads(template.get("template_json", "{}"))
        data["course_id"] = course_id
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to parse template JSON") from exc
