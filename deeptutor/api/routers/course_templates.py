from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
import json

from deeptutor.services.session.sqlite_store import get_sqlite_session_store, SQLiteSessionStore

router = APIRouter()

@router.post("/course-templates/import")
async def import_course_template(
    payload: Dict[str, Any],
    store: SQLiteSessionStore = Depends(get_sqlite_session_store)
):
    """
    Import a JSON course graph template and upsert it into the database.
    """
    course_id = payload.get("course_id")
    if not course_id:
        raise HTTPException(status_code=400, detail="Missing course_id in payload")
    
    try:
        # SQLiteStore provides synchronous logic wrapped or an async interface natively
        await store.upsert_course_template(course_id, json.dumps(payload, ensure_ascii=False))
        return {"course_id": course_id}
    except Exception as e:
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
