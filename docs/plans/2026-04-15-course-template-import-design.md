# Course Template Import API & UI Integration

## Overview

Currently, the knowledge graph visualization displays a hardcoded tree. To fully realize the dynamic knowledge graph experience, we need a way for administrators or educators to upload a JSON syllabus/template which populates the initial static "Main Path" of the Knowledge Graph Viewer. 

This design outlines a "File Upload" approach to importing course templates, alongside a rendering mechanism that retrieves the course template dynamically instead of hardcoding initial nodes.

## 1. Frontend (Upload Component)
- **Component:** A new UI control (e.g., an "Import Graph" button) placed either in the central workspace header or floating on the `KnowledgeGraphViewer`.
- **Behavior:** Clicking the button opens a native file picker restricted to `.json` files.
- **Data Flow:** The selected file is parsed client-side to ensure it is valid JSON. The JSON payload is then sent directly via a `POST` request to the backend API.

## 2. Backend (API Endpoint)
- **Endpoint:** `POST /api/v1/course-templates/import`
- **Validation:** 
  - Ensure the JSON matches the schema requirements for `CourseGraphTemplate` (e.g., requires `course_id`, `title`, `nodes`, `edges`).
- **Persistence:** 
  - Converts the JSON payload into domain entities.
  - Calls `sqlite_store.upsert_course_template(template)` (built in Phase 2) to store the result into the database.
- **Response:** Returns `200 OK` with the synced `course_id`.

## 3. Dynamic Rendering (Initialization)
- **Endpoint:** `GET /api/v1/course-templates/{course_id}`
  - Fetches the persisted `CourseGraphTemplate` from the database.
- **Frontend Refactoring `KnowledgeGraphViewer.tsx`:** 
  - On mount, if a `sessionId` is provided, also identify the bound `course_id` (either from the session or a passed prop).
  - Fetches the base template from the `GET` endpoint.
  - Recursively maps the fetched base `nodes` and `edges` into `@xyflow/react` node/edge arrays to form the initial "Main Path".
  - Initializes WebSocket hook *after* the static graph loads, allowing side-quests to attach dynamically.
  
## 4. Error Handling
- **Backend:** 
  - `400 Bad Request` if the schema is malformed or invalid.
  - `500 Internal Server Error` if DB persistence fails.
- **Frontend:**
  - Displays red alert/toast notifications explicitly calling out the parsing or server-side failure.
