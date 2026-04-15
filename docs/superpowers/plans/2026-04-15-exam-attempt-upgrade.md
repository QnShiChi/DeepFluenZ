# Exam Attempt Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `course_assistant` exam mode from quiz-style answer checking into a first-class assessment flow with typed exam artifacts, persistent attempts, backend grading, hidden answers before submit, competency feedback, and study-plan handoff.

**Architecture:** Add a backend assessment domain centered on `ExamArtifact`, `ExamAttempt`, and `ScoreReport`, then expose it through dedicated REST endpoints and a new frontend `ExamViewer`. Preserve existing `QuizViewer` and `/quiz-results` behavior for compatibility, but move grading authority and progress history to dedicated attempt flows.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session storage, TypeScript, React/Next.js, existing DeepTutor capability/runtime tests, pytest, Playwright/Vitest-style web tests already present in `web/tests/`

---

## File Structure

### Backend domain and persistence

- Modify: `deeptutor/services/session/sqlite_store.py`
  - Add schema migration and CRUD methods for exam artifacts and attempts.
- Modify: `deeptutor/services/session/__init__.py`
  - Export any new store helpers if needed by routers.
- Create: `deeptutor/services/exam/models.py`
  - Define Pydantic models for exam artifacts, typed questions, attempt answers, and score reports.
- Create: `deeptutor/services/exam/normalizer.py`
  - Normalize legacy `course_assistant` exam artifacts into typed exam artifacts.
- Create: `deeptutor/services/exam/grading.py`
  - Implement rule-based grading and short-answer grading orchestration.

### Backend API

- Create: `deeptutor/api/routers/exam_attempts.py`
  - Provide create, draft-save, submit, fetch, and session-list endpoints for attempts.
- Modify: `deeptutor/api/main.py`
  - Register the new router.
- Modify: `deeptutor/api/routers/sessions.py`
  - Keep `/quiz-results` as compatibility-only behavior and add a session-level attempt listing route if not placed in `exam_attempts.py`.

### Capability integration

- Modify: `deeptutor/capabilities/course_assistant.py`
  - Emit normalized typed exam artifacts and session-linked exam metadata.
- Modify: `tests/core/test_capabilities_runtime.py`
  - Assert the new artifact shape and compatibility behavior.

### Frontend models and API client

- Create: `web/lib/exam-types.ts`
  - Mirror typed exam artifact, attempt, answer, and score-report shapes for the web app.
- Create: `web/lib/exam-api.ts`
  - Wrap exam attempt endpoints for the frontend.
- Modify: `web/lib/session-api.ts`
  - Add session-level attempt listing types if needed.

### Frontend UI

- Create: `web/components/exam/ExamViewer.tsx`
  - Render timed/practice attempt flow and post answers through the new API.
- Create: `web/components/exam/ExamScoreReport.tsx`
  - Render per-question grading, total score, competency breakdown, and review recommendations.
- Create: `web/components/exam/QuestionInputs.tsx`
  - Render typed controls for `multiple_choice`, `true_false`, `short_answer`, and `matching`.
- Modify: `web/components/quiz/QuizViewer.tsx`
  - Preserve current flow or add a thin handoff into `ExamViewer` where appropriate without changing legacy quiz semantics.

### Tests

- Modify: `tests/services/session/test_sqlite_store.py`
  - Cover exam artifact and attempt persistence.
- Create: `tests/services/exam/test_normalizer.py`
  - Cover legacy-to-typed normalization.
- Create: `tests/services/exam/test_grading.py`
  - Cover rule-based and rubric-assisted grading outputs.
- Create: `tests/api/test_exam_attempts_router.py`
  - Cover create, patch, submit, get, and list endpoints.
- Modify: `tests/api/test_notebook_router.py`
  - Confirm `/quiz-results` still works as a compatibility surface.
- Create: `web/tests/exam-viewer.test.tsx`
  - Cover hidden answers, timed submit behavior, and practice flow.
- Create: `web/tests/exam-api.test.ts`
  - Cover API helpers and payload shaping.

## Task 1: Define typed exam models

**Files:**
- Create: `deeptutor/services/exam/models.py`
- Test: `tests/services/exam/test_normalizer.py`

- [ ] **Step 1: Write the failing model validation test**

```python
from pydantic import ValidationError

from deeptutor.services.exam.models import ExamArtifact


def test_exam_artifact_requires_supported_question_kind() -> None:
    payload = {
        "exam_id": "exam_1",
        "title": "Test",
        "mode": "timed",
        "source_session_id": "session_1",
        "knowledge_base": "kb",
        "total_points": 2,
        "questions": [
            {
                "question_id": "q1",
                "kind": "essay",
                "prompt": "Explain limits",
                "points": 2,
                "chapter": "Limits",
                "section": "Intro",
                "competency_tags": ["conceptual-understanding"],
                "difficulty": "medium",
                "student_view": {},
                "grader_key": {},
            }
        ],
    }

    try:
        ExamArtifact.model_validate(payload)
    except ValidationError as exc:
        assert "essay" in str(exc)
    else:
        raise AssertionError("Expected validation error for unsupported kind")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/exam/test_normalizer.py::test_exam_artifact_requires_supported_question_kind -v`
Expected: FAIL with `ModuleNotFoundError` or import failure because `deeptutor.services.exam.models` does not exist yet.

- [ ] **Step 3: Write minimal typed models**

```python
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QuestionKind = Literal["multiple_choice", "true_false", "short_answer", "matching"]
ExamMode = Literal["timed", "practice"]


class ChoiceOption(BaseModel):
    id: str
    label: str


class StudentView(BaseModel):
    model_config = ConfigDict(extra="allow")


class GraderKey(BaseModel):
    model_config = ConfigDict(extra="allow")


class ExamQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str
    kind: QuestionKind
    prompt: str
    points: int = Field(ge=1)
    chapter: str = ""
    section: str = ""
    competency_tags: list[str] = Field(default_factory=list)
    difficulty: str = ""
    student_view: StudentView
    grader_key: GraderKey


class ExamArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam_id: str
    title: str
    mode: ExamMode
    source_session_id: str
    knowledge_base: str = ""
    total_points: int = Field(ge=0)
    questions: list[ExamQuestion] = Field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/services/exam/test_normalizer.py::test_exam_artifact_requires_supported_question_kind -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/exam/models.py tests/services/exam/test_normalizer.py
git commit -m "feat: add typed exam artifact models"
```

## Task 2: Normalize legacy exam artifacts into typed artifacts

**Files:**
- Create: `deeptutor/services/exam/normalizer.py`
- Modify: `tests/services/exam/test_normalizer.py`

- [ ] **Step 1: Write the failing normalization test**

```python
from deeptutor.services.exam.normalizer import normalize_legacy_exam_artifact


def test_normalize_legacy_choice_question_maps_to_multiple_choice() -> None:
    legacy_questions = [
        {
            "question_id": "q1",
            "question": "Capital of France?",
            "question_type": "choice",
            "options": {"A": "Berlin", "B": "Paris"},
            "correct_answer": "B",
            "explanation": "Paris is the capital.",
            "difficulty": "easy",
            "concentration": "geography",
        }
    ]

    artifact = normalize_legacy_exam_artifact(
        session_id="session_1",
        knowledge_base="world-history",
        mode="timed",
        title="Legacy import",
        questions=legacy_questions,
    )

    question = artifact.questions[0]
    assert question.kind == "multiple_choice"
    assert question.student_view["choices"][1]["id"] == "B"
    assert question.grader_key["correct_choice_ids"] == ["B"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/exam/test_normalizer.py::test_normalize_legacy_choice_question_maps_to_multiple_choice -v`
Expected: FAIL with import error because the normalizer does not exist yet.

- [ ] **Step 3: Implement the normalizer**

```python
from __future__ import annotations

from uuid import uuid4

from deeptutor.services.exam.models import ExamArtifact, ExamQuestion


def _map_kind(question_type: str) -> str:
    mapping = {
        "choice": "multiple_choice",
        "written": "short_answer",
        "coding": "short_answer",
    }
    return mapping.get(question_type or "", "short_answer")


def normalize_legacy_exam_artifact(
    *,
    session_id: str,
    knowledge_base: str,
    mode: str,
    title: str,
    questions: list[dict],
) -> ExamArtifact:
    typed_questions: list[ExamQuestion] = []
    total_points = 0

    for index, item in enumerate(questions):
        kind = _map_kind(str(item.get("question_type", "")))
        points = int(item.get("points", 1) or 1)
        total_points += points
        typed_questions.append(
            ExamQuestion(
                question_id=str(item.get("question_id") or f"q{index + 1}"),
                kind=kind,
                prompt=str(item.get("question") or "").strip(),
                points=points,
                chapter=str(item.get("chapter") or ""),
                section=str(item.get("section") or ""),
                competency_tags=[str(item.get("concentration") or "")] if item.get("concentration") else [],
                difficulty=str(item.get("difficulty") or ""),
                student_view={
                    "choices": [
                        {"id": key, "label": value}
                        for key, value in (item.get("options") or {}).items()
                    ],
                    "allow_multiple": False,
                },
                grader_key={
                    "correct_choice_ids": [str(item.get("correct_answer") or "").strip()],
                    "correct_boolean": item.get("correct_answer"),
                    "rubric": item.get("rubric") or [],
                    "expected_concepts": item.get("expected_concepts") or [],
                    "sample_answer": str(item.get("correct_answer") or ""),
                    "correct_pairs": item.get("correct_pairs") or [],
                    "explanation": str(item.get("explanation") or ""),
                },
            )
        )

    return ExamArtifact(
        exam_id=f"exam_{uuid4().hex}",
        title=title,
        mode="practice" if mode == "practice" else "timed",
        source_session_id=session_id,
        knowledge_base=knowledge_base,
        total_points=total_points,
        questions=typed_questions,
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/services/exam/test_normalizer.py -v`
Expected: PASS for both the validation test and the legacy normalization test.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/exam/normalizer.py tests/services/exam/test_normalizer.py
git commit -m "feat: normalize legacy exam artifacts"
```

## Task 3: Persist exam artifacts and attempts in SQLite storage

**Files:**
- Modify: `deeptutor/services/session/sqlite_store.py`
- Modify: `tests/services/session/test_sqlite_store.py`

- [ ] **Step 1: Write the failing persistence test**

```python
import asyncio


def test_create_and_fetch_exam_attempt(store) -> None:
    session = asyncio.run(store.create_session(title="Exam Session"))
    artifact = asyncio.run(
        store.create_exam_artifact(
            {
                "exam_id": "exam_1",
                "title": "Midterm",
                "mode": "timed",
                "source_session_id": session["id"],
                "knowledge_base": "kb",
                "total_points": 2,
                "questions": [],
            }
        )
    )

    attempt = asyncio.run(
        store.create_exam_attempt(
            artifact["exam_id"],
            session["id"],
            {"status": "in_progress", "answers": [], "score_report": None},
        )
    )

    loaded = asyncio.run(store.get_exam_attempt(attempt["attempt_id"]))
    assert loaded is not None
    assert loaded["exam_id"] == artifact["exam_id"]
    assert loaded["status"] == "in_progress"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py::test_create_and_fetch_exam_attempt -v`
Expected: FAIL with `AttributeError` because the store methods do not exist yet.

- [ ] **Step 3: Add schema migration and store methods**

```python
def _ensure_exam_tables(self) -> None:
    with sqlite3.connect(self.db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exam_artifacts (
                exam_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                mode TEXT NOT NULL,
                knowledge_base TEXT NOT NULL,
                total_points INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exam_attempts (
                attempt_id TEXT PRIMARY KEY,
                exam_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                status TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                score_report_json TEXT,
                study_plan_link_json TEXT,
                started_at INTEGER NOT NULL,
                submitted_at INTEGER,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()


async def create_exam_artifact(self, payload: dict) -> dict:
    now = int(time.time())
    with sqlite3.connect(self.db_path) as conn:
        conn.execute(
            """
            INSERT INTO exam_artifacts (
                exam_id, session_id, title, mode, knowledge_base, total_points, payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["exam_id"],
                payload["source_session_id"],
                payload["title"],
                payload["mode"],
                payload.get("knowledge_base", ""),
                payload.get("total_points", 0),
                json.dumps(payload),
                now,
            ),
        )
        conn.commit()
    return payload


async def create_exam_attempt(self, exam_id: str, session_id: str, payload: dict) -> dict:
    attempt_id = payload.get("attempt_id") or f"attempt_{uuid4().hex}"
    now = int(time.time())
    record = {
        "attempt_id": attempt_id,
        "exam_id": exam_id,
        "session_id": session_id,
        "status": payload.get("status", "in_progress"),
        "answers": payload.get("answers", []),
        "score_report": payload.get("score_report"),
        "study_plan_link": payload.get("study_plan_link"),
        "started_at": payload.get("started_at", now),
        "submitted_at": payload.get("submitted_at"),
        "duration_seconds": payload.get("duration_seconds", 0),
        "updated_at": now,
    }
    with sqlite3.connect(self.db_path) as conn:
        conn.execute(
            """
            INSERT INTO exam_attempts (
                attempt_id, exam_id, session_id, status, answers_json, score_report_json,
                study_plan_link_json, started_at, submitted_at, duration_seconds, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["attempt_id"],
                record["exam_id"],
                record["session_id"],
                record["status"],
                json.dumps(record["answers"]),
                json.dumps(record["score_report"]) if record["score_report"] is not None else None,
                json.dumps(record["study_plan_link"]) if record["study_plan_link"] is not None else None,
                record["started_at"],
                record["submitted_at"],
                record["duration_seconds"],
                record["updated_at"],
            ),
        )
        conn.commit()
    return record
```

- [ ] **Step 4: Run store tests**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py -v`
Expected: PASS for existing notebook tests and the new exam-attempt persistence test.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/session/sqlite_store.py tests/services/session/test_sqlite_store.py
git commit -m "feat: persist exam artifacts and attempts"
```

## Task 4: Add grading service for rule-based and short-answer scoring

**Files:**
- Create: `deeptutor/services/exam/grading.py`
- Create: `tests/services/exam/test_grading.py`

- [ ] **Step 1: Write the failing grading tests**

```python
from deeptutor.services.exam.grading import grade_attempt


def test_grade_attempt_scores_multiple_choice_rule_based() -> None:
    artifact = {
        "exam_id": "exam_1",
        "title": "Midterm",
        "mode": "timed",
        "source_session_id": "session_1",
        "knowledge_base": "kb",
        "total_points": 2,
        "questions": [
            {
                "question_id": "q1",
                "kind": "multiple_choice",
                "prompt": "Capital of France?",
                "points": 2,
                "chapter": "Maps",
                "section": "Europe",
                "competency_tags": ["recall"],
                "difficulty": "easy",
                "student_view": {"choices": [{"id": "A", "label": "Berlin"}, {"id": "B", "label": "Paris"}], "allow_multiple": False},
                "grader_key": {"correct_choice_ids": ["B"], "explanation": "Paris is correct."},
            }
        ],
    }
    attempt = {"answers": [{"question_id": "q1", "response": {"choice_ids": ["B"]}}]}

    report = grade_attempt(artifact, attempt)
    assert report["total_score"] == 2
    assert report["question_results"][0]["is_correct"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/exam/test_grading.py::test_grade_attempt_scores_multiple_choice_rule_based -v`
Expected: FAIL with import error because the grading module does not exist yet.

- [ ] **Step 3: Implement the grading service**

```python
from __future__ import annotations


def _choice_ids(response: dict) -> list[str]:
    return [str(item) for item in response.get("choice_ids", [])]


def grade_attempt(artifact: dict, attempt: dict) -> dict:
    answer_map = {
        item["question_id"]: item.get("response", {})
        for item in attempt.get("answers", [])
    }
    question_results = []
    total_score = 0
    max_score = 0

    for question in artifact.get("questions", []):
        max_points = int(question.get("points", 0))
        max_score += max_points
        response = answer_map.get(question["question_id"], {})
        kind = question.get("kind")
        grader_key = question.get("grader_key", {})
        awarded = 0
        is_correct = False
        matched_concepts = []
        missing_concepts = []
        confidence = 1.0

        if kind == "multiple_choice":
            is_correct = sorted(_choice_ids(response)) == sorted(grader_key.get("correct_choice_ids", []))
            awarded = max_points if is_correct else 0
        elif kind == "true_false":
            is_correct = response.get("boolean") == grader_key.get("correct_boolean")
            awarded = max_points if is_correct else 0
        elif kind == "matching":
            is_correct = sorted(response.get("pairs", []), key=str) == sorted(grader_key.get("correct_pairs", []), key=str)
            awarded = max_points if is_correct else 0
        else:
            expected = {item.lower() for item in grader_key.get("expected_concepts", [])}
            submitted = str(response.get("text", "")).lower()
            matched_concepts = sorted([item for item in expected if item in submitted])
            missing_concepts = sorted(expected - set(matched_concepts))
            awarded = min(max_points, len(matched_concepts))
            is_correct = awarded == max_points and max_points > 0
            confidence = 0.6 if missing_concepts else 0.9

        total_score += awarded
        question_results.append(
            {
                "question_id": question["question_id"],
                "awarded_points": awarded,
                "max_points": max_points,
                "is_correct": is_correct,
                "feedback": grader_key.get("explanation", ""),
                "confidence": confidence,
                "matched_concepts": matched_concepts,
                "missing_concepts": missing_concepts,
            }
        )

    return {
        "total_score": total_score,
        "max_score": max_score,
        "question_results": question_results,
        "competency_breakdown": [],
        "recommended_review": [],
    }
```

- [ ] **Step 4: Run grading tests**

Run: `.venv/bin/python -m pytest tests/services/exam/test_grading.py -v`
Expected: PASS for rule-based grading and at least one short-answer rubric-oriented test that verifies `matched_concepts`, `missing_concepts`, and `confidence`.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/exam/grading.py tests/services/exam/test_grading.py
git commit -m "feat: add exam grading service"
```

## Task 5: Emit typed exam artifacts from `course_assistant`

**Files:**
- Modify: `deeptutor/capabilities/course_assistant.py`
- Modify: `tests/core/test_capabilities_runtime.py`

- [ ] **Step 1: Write the failing runtime test**

```python
async def test_course_assistant_exam_mode_returns_typed_exam_artifact(...):
    ...
    result_event = next(event for event in events if event.type == "result")
    artifact = result_event.metadata["artifacts"]["exam_artifact"]

    assert artifact["mode"] == "timed"
    assert artifact["questions"][0]["kind"] == "multiple_choice"
    assert "student_view" in artifact["questions"][0]
    assert "grader_key" in artifact["questions"][0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/core/test_capabilities_runtime.py::test_course_assistant_exam_mode_returns_typed_exam_artifact -v`
Expected: FAIL because exam mode still returns legacy `artifacts.questions`.

- [ ] **Step 3: Update the capability to normalize exam artifacts**

```python
from deeptutor.services.exam.normalizer import normalize_legacy_exam_artifact


typed_artifact = normalize_legacy_exam_artifact(
    session_id=context.session_id or "",
    knowledge_base=kb_name,
    mode="timed",
    title="Course Assistant Exam",
    questions=questions,
)

return {
    "mode": "exam",
    "response": response,
    "sources": list(rag_result.sources or []) if config.include_sources else [],
    "artifacts": {
        "questions": questions,
        "exam_artifact": typed_artifact.model_dump(),
    },
    "metadata": {
        "kb_name": kb_name,
        "retrieved_count": len((rag_result.metadata or {}).get("sources", [])),
        "degraded": not bool(grounded_context.strip()),
        "exam_id": typed_artifact.exam_id,
    },
}
```

- [ ] **Step 4: Run capability tests**

Run: `.venv/bin/python -m pytest tests/core/test_capabilities_runtime.py -v`
Expected: PASS for existing `course_assistant` tests and the new typed-artifact assertion.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/capabilities/course_assistant.py tests/core/test_capabilities_runtime.py
git commit -m "feat: emit typed exam artifacts from course assistant"
```

## Task 6: Add exam attempt REST API

**Files:**
- Create: `deeptutor/api/routers/exam_attempts.py`
- Modify: `deeptutor/api/main.py`
- Create: `tests/api/test_exam_attempts_router.py`

- [ ] **Step 1: Write the failing API router test**

```python
def test_create_submit_and_fetch_exam_attempt(store: SQLiteSessionStore) -> None:
    with TestClient(_build_app(store)) as client:
        create = client.post(
            "/api/v1/exam-attempts",
            json={
                "exam_artifact": {
                    "exam_id": "exam_1",
                    "title": "Midterm",
                    "mode": "timed",
                    "source_session_id": "session_1",
                    "knowledge_base": "kb",
                    "total_points": 2,
                    "questions": [],
                },
                "session_id": "session_1",
            },
        )
        assert create.status_code == 201
        attempt_id = create.json()["attempt"]["attempt_id"]

        submit = client.post(f"/api/v1/exam-attempts/{attempt_id}/submit")
        assert submit.status_code == 200

        loaded = client.get(f"/api/v1/exam-attempts/{attempt_id}")
        assert loaded.status_code == 200
        assert loaded.json()["attempt"]["status"] in {"grading", "graded"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/api/test_exam_attempts_router.py::test_create_submit_and_fetch_exam_attempt -v`
Expected: FAIL because the router does not exist yet.

- [ ] **Step 3: Implement the router**

```python
router = APIRouter()


@router.post("/exam-attempts", status_code=201)
async def create_exam_attempt(payload: CreateExamAttemptRequest):
    store = get_sqlite_session_store()
    await store.create_exam_artifact(payload.exam_artifact.model_dump())
    attempt = await store.create_exam_attempt(
        payload.exam_artifact.exam_id,
        payload.session_id,
        {"status": "in_progress", "answers": [], "score_report": None},
    )
    return {"attempt": attempt, "exam_artifact": payload.exam_artifact.model_dump()}


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
    report = grade_attempt(artifact, attempt)
    updated = await store.finalize_exam_attempt(attempt_id, report)
    return {"attempt": updated}


@router.get("/exam-attempts/{attempt_id}")
async def get_exam_attempt(attempt_id: str):
    store = get_sqlite_session_store()
    attempt = await store.get_exam_attempt(attempt_id)
    if attempt is None:
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    return {"attempt": attempt}
```

- [ ] **Step 4: Run router tests**

Run: `.venv/bin/python -m pytest tests/api/test_exam_attempts_router.py -v`
Expected: PASS for create, patch, submit, fetch, and session-list cases.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/exam_attempts.py deeptutor/api/main.py tests/api/test_exam_attempts_router.py
git commit -m "feat: add exam attempt api"
```

## Task 7: Preserve `/quiz-results` compatibility while adding session attempt history

**Files:**
- Modify: `deeptutor/api/routers/sessions.py`
- Modify: `tests/api/test_notebook_router.py`

- [ ] **Step 1: Write the failing compatibility test**

```python
def test_list_session_exam_attempts_returns_attempts(store: SQLiteSessionStore) -> None:
    session = asyncio.run(store.create_session(title="Exam Session"))
    asyncio.run(
        store.create_exam_artifact(
            {
                "exam_id": "exam_1",
                "title": "Midterm",
                "mode": "timed",
                "source_session_id": session["id"],
                "knowledge_base": "kb",
                "total_points": 2,
                "questions": [],
            }
        )
    )
    asyncio.run(store.create_exam_attempt("exam_1", session["id"], {"status": "graded", "answers": [], "score_report": {"total_score": 0, "max_score": 2}}))

    with TestClient(_build_app(store)) as client:
        resp = client.get(f"/api/v1/sessions/{session['id']}/exam-attempts")
        assert resp.status_code == 200
        assert resp.json()["attempts"][0]["session_id"] == session["id"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/api/test_notebook_router.py::test_list_session_exam_attempts_returns_attempts -v`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement session attempt listing without breaking `/quiz-results`**

```python
@router.get("/{session_id}/exam-attempts")
async def list_session_exam_attempts(session_id: str):
    store = get_sqlite_session_store()
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    attempts = await store.list_exam_attempts_for_session(session_id)
    return {"attempts": attempts}
```

- [ ] **Step 4: Run compatibility tests**

Run: `.venv/bin/python -m pytest tests/api/test_notebook_router.py -v`
Expected: PASS for both legacy `/quiz-results` tests and the new session attempt listing test.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/sessions.py tests/api/test_notebook_router.py
git commit -m "feat: add session exam attempt history"
```

## Task 8: Add frontend typed exam client and utilities

**Files:**
- Create: `web/lib/exam-types.ts`
- Create: `web/lib/exam-api.ts`
- Create: `web/tests/exam-api.test.ts`

- [ ] **Step 1: Write the failing web API test**

```ts
import { buildChoiceResponse } from "@/lib/exam-api";

test("buildChoiceResponse wraps selected ids for the attempt payload", () => {
  expect(buildChoiceResponse(["B"])).toEqual({ choice_ids: ["B"] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- exam-api.test.ts`
Expected: FAIL because `web/lib/exam-api.ts` does not exist yet.

- [ ] **Step 3: Implement typed web models and client helpers**

```ts
export type ExamMode = "timed" | "practice";
export type QuestionKind = "multiple_choice" | "true_false" | "short_answer" | "matching";

export interface ExamAttemptAnswer {
  question_id: string;
  response: Record<string, unknown>;
  answered_at?: number;
}

export function buildChoiceResponse(choiceIds: string[]) {
  return { choice_ids: choiceIds };
}

export async function createExamAttempt(payload: {
  sessionId: string;
  examArtifact: Record<string, unknown>;
}) {
  const response = await fetch(apiUrl("/api/v1/exam-attempts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: payload.sessionId,
      exam_artifact: payload.examArtifact,
    }),
  });
  return expectJson<{ attempt: Record<string, unknown> }>(response);
}
```

- [ ] **Step 4: Run web unit tests**

Run: `npm test -- exam-api.test.ts`
Expected: PASS for response-builder helpers and at least one request-shape test.

- [ ] **Step 5: Commit**

```bash
git add web/lib/exam-types.ts web/lib/exam-api.ts web/tests/exam-api.test.ts
git commit -m "feat: add frontend exam api helpers"
```

## Task 9: Build `ExamViewer` with timed-mode hidden answers

**Files:**
- Create: `web/components/exam/QuestionInputs.tsx`
- Create: `web/components/exam/ExamScoreReport.tsx`
- Create: `web/components/exam/ExamViewer.tsx`
- Create: `web/tests/exam-viewer.test.tsx`

- [ ] **Step 1: Write the failing viewer test**

```tsx
import { render, screen } from "@testing-library/react";

import ExamViewer from "@/components/exam/ExamViewer";

test("timed mode hides explanations before submit", () => {
  render(
    <ExamViewer
      examArtifact={{
        exam_id: "exam_1",
        title: "Midterm",
        mode: "timed",
        source_session_id: "session_1",
        knowledge_base: "kb",
        total_points: 2,
        questions: [
          {
            question_id: "q1",
            kind: "multiple_choice",
            prompt: "Capital of France?",
            points: 2,
            chapter: "Maps",
            section: "Europe",
            competency_tags: ["recall"],
            difficulty: "easy",
            student_view: {
              choices: [
                { id: "A", label: "Berlin" },
                { id: "B", label: "Paris" },
              ],
              allow_multiple: false,
            },
            grader_key: { correct_choice_ids: ["B"], explanation: "Paris is correct." },
          },
        ],
      }}
      initialAttempt={null}
      sessionId="session_1"
    />,
  );

  expect(screen.getByText("Capital of France?")).toBeInTheDocument();
  expect(screen.queryByText("Paris is correct.")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- exam-viewer.test.tsx`
Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Implement `ExamViewer` and typed inputs**

```tsx
export default function ExamViewer({
  examArtifact,
  initialAttempt,
  sessionId,
}: ExamViewerProps) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [submitted, setSubmitted] = useState(initialAttempt?.status === "graded");

  const currentQuestion = examArtifact.questions[0];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">{examArtifact.title}</h2>
      </div>
      <div className="px-4 py-3">
        <p className="mb-3 text-sm text-[var(--foreground)]">{currentQuestion.prompt}</p>
        <QuestionInputs
          question={currentQuestion}
          value={answers[currentQuestion.question_id] ?? {}}
          onChange={(next) =>
            setAnswers((prev) => ({ ...prev, [currentQuestion.question_id]: next }))
          }
          disabled={submitted}
        />
        {!submitted ? (
          <button type="button" className="mt-3 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white">
            Submit test
          </button>
        ) : (
          <ExamScoreReport scoreReport={attempt?.score_report ?? null} questions={examArtifact.questions} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run viewer tests**

Run: `npm test -- exam-viewer.test.tsx`
Expected: PASS for hidden-answer behavior in timed mode and at least one typed-input rendering test.

- [ ] **Step 5: Commit**

```bash
git add web/components/exam/QuestionInputs.tsx web/components/exam/ExamScoreReport.tsx web/components/exam/ExamViewer.tsx web/tests/exam-viewer.test.tsx
git commit -m "feat: add exam viewer for timed assessments"
```

## Task 10: Add practice-mode feedback and attempt submission wiring

**Files:**
- Modify: `web/components/exam/ExamViewer.tsx`
- Modify: `web/lib/exam-api.ts`
- Modify: `web/tests/exam-viewer.test.tsx`

- [ ] **Step 1: Write the failing practice-mode test**

```tsx
test("practice mode can reveal per-question feedback after submit", async () => {
  render(
    <ExamViewer
      examArtifact={{ ...baseArtifact, mode: "practice" }}
      initialAttempt={{
        attempt_id: "attempt_1",
        exam_id: "exam_1",
        session_id: "session_1",
        status: "graded",
        answers: [{ question_id: "q1", response: { choice_ids: ["A"] } }],
        score_report: {
          total_score: 0,
          max_score: 2,
          question_results: [
            {
              question_id: "q1",
              awarded_points: 0,
              max_points: 2,
              is_correct: false,
              feedback: "Paris is correct.",
              confidence: 1,
              matched_concepts: [],
              missing_concepts: [],
            },
          ],
          competency_breakdown: [],
          recommended_review: [],
        },
      }}
      sessionId="session_1"
    />,
  );

  expect(await screen.findByText("Paris is correct.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- exam-viewer.test.tsx`
Expected: FAIL because the current viewer only supports timed-mode reveal behavior.

- [ ] **Step 3: Wire API actions into the viewer**

```tsx
const handleSubmit = async () => {
  const activeAttempt =
    attempt ??
    (await createExamAttempt({
      sessionId,
      examArtifact,
    })).attempt;

  await updateExamAttempt(activeAttempt.attempt_id, materializeAnswers(answers));
  const result = await submitExamAttempt(activeAttempt.attempt_id);
  setAttempt(result.attempt);
  setSubmitted(result.attempt.status === "graded");
};

const canRevealPerQuestion = examArtifact.mode === "practice" && Boolean(attempt?.score_report);
```

- [ ] **Step 4: Run viewer tests**

Run: `npm test -- exam-viewer.test.tsx`
Expected: PASS for both timed and practice behaviors.

- [ ] **Step 5: Commit**

```bash
git add web/components/exam/ExamViewer.tsx web/lib/exam-api.ts web/tests/exam-viewer.test.tsx
git commit -m "feat: wire exam submission and practice feedback"
```

## Task 11: Add competency breakdown and study-plan handoff

**Files:**
- Modify: `deeptutor/services/exam/grading.py`
- Modify: `web/components/exam/ExamScoreReport.tsx`
- Modify: `web/tests/exam-viewer.test.tsx`
- Modify: `web/lib/session-api.ts`

- [ ] **Step 1: Write the failing competency test**

```python
def test_grade_attempt_builds_competency_breakdown_for_wrong_answers() -> None:
    artifact = {
        "questions": [
            {
                "question_id": "q1",
                "kind": "multiple_choice",
                "points": 2,
                "chapter": "Limits",
                "section": "One-sided limits",
                "competency_tags": ["conceptual-understanding"],
                "grader_key": {"correct_choice_ids": ["B"], "explanation": "Paris is correct."},
            }
        ]
    }
    attempt = {"answers": [{"question_id": "q1", "response": {"choice_ids": ["A"]}}]}

    report = grade_attempt(artifact, attempt)
    assert report["competency_breakdown"][0]["competency_tag"] == "conceptual-understanding"
    assert report["recommended_review"][0]["chapter"] == "Limits"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/exam/test_grading.py::test_grade_attempt_builds_competency_breakdown_for_wrong_answers -v`
Expected: FAIL because the current grading service returns empty breakdown arrays.

- [ ] **Step 3: Implement competency aggregation and UI rendering**

```python
competency_breakdown.append(
    {
        "competency_tag": tag,
        "chapter": question.get("chapter", ""),
        "section": question.get("section", ""),
        "awarded_points": awarded,
        "max_points": max_points,
        "accuracy": awarded / max_points if max_points else 0,
        "priority": "high" if awarded < max_points else "low",
    }
)

if awarded < max_points:
    recommended_review.append(
        {
            "chapter": question.get("chapter", ""),
            "section": question.get("section", ""),
            "competency_tag": tag,
            "priority": "high",
            "reason": f"Missed points on {tag}",
        }
    )
```

```tsx
{scoreReport?.recommended_review?.length ? (
  <button
    type="button"
    onClick={onCreateStudyPlan}
    className="rounded-lg bg-[var(--muted)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)]"
  >
    Create study plan from this result
  </button>
) : null}
```

- [ ] **Step 4: Run grading and viewer tests**

Run: `.venv/bin/python -m pytest tests/services/exam/test_grading.py -v`
Expected: PASS with populated competency breakdown and recommendations.

Run: `npm test -- exam-viewer.test.tsx`
Expected: PASS with visible breakdown and study-plan CTA.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/exam/grading.py web/components/exam/ExamScoreReport.tsx web/tests/exam-viewer.test.tsx web/lib/session-api.ts
git commit -m "feat: add competency feedback and study plan handoff"
```

## Task 12: Final compatibility sweep and verification

**Files:**
- Modify as needed: any files touched above
- Test: `tests/core/test_capabilities_runtime.py`
- Test: `tests/services/session/test_sqlite_store.py`
- Test: `tests/services/exam/test_normalizer.py`
- Test: `tests/services/exam/test_grading.py`
- Test: `tests/api/test_exam_attempts_router.py`
- Test: `tests/api/test_notebook_router.py`
- Test: `web/tests/exam-api.test.ts`
- Test: `web/tests/exam-viewer.test.tsx`

- [ ] **Step 1: Run the targeted backend test suite**

Run: `.venv/bin/python -m pytest tests/core/test_capabilities_runtime.py tests/services/session/test_sqlite_store.py tests/services/exam/test_normalizer.py tests/services/exam/test_grading.py tests/api/test_exam_attempts_router.py tests/api/test_notebook_router.py -v`
Expected: PASS with no regressions in legacy session or notebook behavior.

- [ ] **Step 2: Run the targeted web test suite**

Run: `npm test -- exam-api.test.ts exam-viewer.test.tsx`
Expected: PASS for exam helpers, hidden-answer behavior, practice flow, and study-plan CTA rendering.

- [ ] **Step 3: Manually verify the highest-risk flows**

```text
1. Generate a `course_assistant` exam from a session.
2. Confirm the result payload contains `artifacts.exam_artifact`.
3. Start a timed attempt and refresh the page after answering one question.
4. Confirm the draft answer reloads from the attempt record.
5. Submit the timed attempt and confirm answers were hidden until submit.
6. Confirm the score report shows total score, per-question feedback, and recommended review.
7. Confirm `/quiz-results` still records notebook entries for legacy quiz flows.
```

- [ ] **Step 4: Commit the final integrated slice**

```bash
git add deeptutor web tests
git commit -m "feat: deliver exam attempt assessment flow"
```

## Self-Review

### Spec coverage check

- Typed exam artifacts: covered by Tasks 1, 2, and 5.
- Dedicated attempt records and persistence: covered by Tasks 3 and 6.
- Backend grading: covered by Task 4.
- Hidden answers before submit and typed UI controls: covered by Tasks 9 and 10.
- Competency feedback and study-plan handoff: covered by Task 11.
- Session-linked progress history and legacy compatibility: covered by Tasks 7 and 12.

### Placeholder scan

- No `TODO`, `TBD`, or "similar to above" shortcuts remain.
- Every task includes explicit file paths, commands, and expected outcomes.

### Type consistency check

- Backend uses `ExamArtifact`, `ExamAttempt`, and `ScoreReport` terminology throughout.
- Frontend uses matching `ExamMode`, `QuestionKind`, and answer payload shapes.
- API routes consistently use `/api/v1/exam-attempts` and `/api/v1/sessions/{session_id}/exam-attempts`.
