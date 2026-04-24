from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Dict, Any
import json
import uuid
import pdfplumber

from deeptutor.services.session.sqlite_store import get_sqlite_session_store, SQLiteSessionStore
from deeptutor.services.llm.client import get_llm_client

router = APIRouter(tags=["Course Templates"])

@router.post("/course-templates/extract-pdf")
async def extract_course_template_from_pdf(
    file: UploadFile = File(...),
    store: SQLiteSessionStore = Depends(get_sqlite_session_store)
):
    """
    Extract a CourseGraphTemplate JSON from an uploaded PDF syllabus via AI.
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract any text from the PDF")

    try:
        llm = get_llm_client()
        prompt = f"""You are an educational AI designed to map curricula into Knowledge Graphs.
Given the following syllabus or textbook outline text, output a "CourseGraphTemplate".
The output MUST be exactly raw JSON (with no markdown wrappers or backticks) using this schema:
{{
  "course_id": "a-url-safe-id",
  "title": "Course Title",
  "nodes": [
    {{
      "node_id": "ch1",
      "title": "Concept or Chapter Title",
      "node_type": "core"
    }}
  ],
  "edges": [
    {{
      "source": "ch1",
      "target": "ch2"
    }}
  ]
}}

Extract the main topics into nodes, and add sequential or prerequisite dependency bounds into edges.

Syllabus Text:
{text[:20000]}
"""
        response_text = await llm.complete(prompt=prompt)
        
        # Clean up any markdown blocks if the LLM ignores instructions
        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
        elif response_text.startswith("```"):
            response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
                
        data = json.loads(response_text.strip())
        
        if "course_id" not in data or "nodes" not in data:
            raise ValueError("Missing course_id or nodes in LLM response schema")
            
        # Ensure unique ID
        course_id = data["course_id"] + "-" + str(uuid.uuid4())[:6]
        data["course_id"] = course_id
        
        await store.upsert_course_template(course_id, json.dumps(data, ensure_ascii=False))
        return {"course_id": course_id}
        
    except json.JSONDecodeError as je:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {str(je)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed AI extraction: {str(e)}")

@router.post("/course-templates/import")
async def import_course_template(
    payload: Dict[str, Any],
    store: SQLiteSessionStore = Depends(get_sqlite_session_store)
):
    """
    Import a JSON course graph template and upsert it into the database.
    """
    course_id = payload.get("course_id")
    session_id = payload.get("session_id")
    if not course_id:
        raise HTTPException(status_code=400, detail="Missing course_id in payload")
    
    try:
        # SQLiteStore provides synchronous logic wrapped or an async interface natively
        await store.upsert_course_template(course_id, json.dumps(payload, ensure_ascii=False))
        if session_id:
            updated = await store.update_session_preferences(session_id, {"course_id": course_id})
            if not updated:
                raise HTTPException(status_code=404, detail="Session not found")
        return {"course_id": course_id}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/course-templates/{course_id}")
async def get_course_template(
    course_id: str,
    store: SQLiteSessionStore = Depends(get_sqlite_session_store)
):
    """
    Fetch a JSON course graph template by course ID.
    """
    template = await store.get_course_template(course_id)
    if not template:
        raise HTTPException(status_code=404, detail="Course template not found")
    
    try:
        data = json.loads(template.get("template_json", "{}"))
        # Ensure it has the course_id inside
        data["course_id"] = course_id
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to parse template JSON")
