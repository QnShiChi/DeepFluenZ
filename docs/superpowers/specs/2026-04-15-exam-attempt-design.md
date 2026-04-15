# Exam Attempt Upgrade Design

Date: 2026-04-15
Status: Proposed and approved for planning

## Goal

Upgrade `course_assistant` exam mode from a quiz-style question dump into a real assessment flow with:

- hidden answers before submission
- standardized question schemas
- typed answer interactions
- per-question and total scoring
- competency-aware feedback
- study plan handoff
- persistent attempt history

The design should fit the current DeepTutor architecture without forcing unrelated refactors.

## Product Decisions

The following product decisions were validated during brainstorming:

- Exam mode is `hybrid`, with `timed` as the default behavior
- Scoring is `mixed`
- Persistence is `hybrid`

### Meaning of those decisions

- `hybrid` exam mode means the system supports both:
  - `timed`: user answers the whole test, submits once, then sees grading and answers
  - `practice`: user can submit and review question-by-question
- `mixed` scoring means:
  - `multiple_choice`, `true_false`, and `matching` are graded rule-based
  - `short_answer` is graded with a rubric-assisted LLM scorer and returns confidence
- `hybrid` persistence means:
  - exam summaries still appear in the chat/session timeline
  - detailed attempt records live in dedicated exam attempt storage

## Current-State Findings

The current implementation already provides useful building blocks, but it does not represent a true exam lifecycle.

### What exists now

- `course_assistant` exam mode returns generated questions in `artifacts.questions`
- `web/components/quiz/QuizViewer.tsx` renders question interactions
- `web/lib/session-api.ts` posts submitted answers to `/api/v1/sessions/{session_id}/quiz-results`
- `/quiz-results` persists a summary message and upserts notebook entries

### Boundary problems in the current flow

- UI behavior is quiz-oriented, not attempt-oriented
- question display and answer key are coupled too tightly
- `question_type` is loosely typed and not enough for real assessment UX
- `/quiz-results` acts more like notebook synchronization than exam persistence
- scoring logic currently lives too close to the frontend interaction layer
- progress history is not modeled as first-class assessment attempts

## Recommended Approach

Use a layered hybrid approach.

### What this means

- Keep reusable parts of the current quiz rendering and session integration
- Introduce a new domain layer for `exam artifact`, `exam attempt`, and `score report`
- Treat notebook sync as a secondary side effect, not the system of record
- Move grading authority to the backend
- Add a dedicated exam viewer flow that consumes attempts rather than raw quiz data

### Why this approach

This approach gives the cleanest long-term model without discarding useful existing code.

It is better than a UI-only rewrite because analytics, history, and study-plan handoff need structured backend state. It is lighter than a full greenfield rewrite because DeepTutor already has session, artifact, and quiz rendering infrastructure that we can reuse.

## Domain Model

The new boundary should separate three concepts.

### 1. Exam artifact

The exam artifact is the generated assessment definition. It describes the exam itself and the questions to answer.

Responsibilities:

- define the exam metadata
- define the student-visible question content
- define the grading key and rubric
- map questions to chapter, section, and competency tags

### 2. Exam attempt

The exam attempt is one learner run through an exam artifact.

Responsibilities:

- store answers and timestamps
- track attempt state
- track duration and submission lifecycle
- serve as the source of truth for progress history

### 3. Score report

The score report is the result of grading an attempt.

Responsibilities:

- provide per-question outcomes
- compute total score and max score
- summarize weak competencies and chapters
- provide feedback suitable for direct study-plan handoff

## Data Model

### Exam artifact

Proposed top-level shape:

```json
{
  "exam_id": "exam_123",
  "title": "Midterm Practice Set",
  "mode": "timed",
  "source_session_id": "session_123",
  "knowledge_base": "math101",
  "total_points": 20,
  "questions": []
}
```

Each question has a common envelope:

```json
{
  "question_id": "q1",
  "kind": "multiple_choice",
  "prompt": "What is ...?",
  "points": 2,
  "chapter": "Limits",
  "section": "One-sided limits",
  "competency_tags": ["conceptual-understanding", "symbolic-reasoning"],
  "difficulty": "medium",
  "student_view": {},
  "grader_key": {}
}
```

### Question kinds

Supported exam question kinds for this design:

- `multiple_choice`
- `true_false`
- `short_answer`
- `matching`

#### `multiple_choice`

```json
{
  "kind": "multiple_choice",
  "student_view": {
    "choices": [
      { "id": "A", "label": "..." },
      { "id": "B", "label": "..." }
    ],
    "allow_multiple": false
  },
  "grader_key": {
    "correct_choice_ids": ["B"],
    "explanation": "..."
  }
}
```

#### `true_false`

```json
{
  "kind": "true_false",
  "student_view": {},
  "grader_key": {
    "correct_boolean": true,
    "explanation": "..."
  }
}
```

#### `short_answer`

```json
{
  "kind": "short_answer",
  "student_view": {
    "input_mode": "textarea",
    "max_length": 800
  },
  "grader_key": {
    "rubric": [
      { "criterion": "Mentions derivative definition", "points": 1 },
      { "criterion": "Explains continuity condition", "points": 1 }
    ],
    "expected_concepts": ["derivative", "continuity"],
    "sample_answer": "...",
    "explanation": "..."
  }
}
```

#### `matching`

```json
{
  "kind": "matching",
  "student_view": {
    "left_items": [
      { "id": "L1", "label": "..." }
    ],
    "right_items": [
      { "id": "R1", "label": "..." }
    ]
  },
  "grader_key": {
    "correct_pairs": [
      { "left_id": "L1", "right_id": "R1" }
    ],
    "explanation": "..."
  }
}
```

### Why `student_view` and `grader_key` are separate

This split makes the contract explicit:

- `student_view` is what the UI can safely render before submission
- `grader_key` contains correct answers, rubric, and explanations

The backend may still return both to a trusted first-party client, but the artifact contract should preserve this boundary so frontend code does not accidentally reveal hidden data.

### Exam attempt

```json
{
  "attempt_id": "attempt_123",
  "exam_id": "exam_123",
  "session_id": "session_123",
  "status": "in_progress",
  "started_at": 1776210000,
  "submitted_at": null,
  "duration_seconds": 0,
  "answers": [],
  "score_report": null,
  "study_plan_link": null
}
```

Each answer entry:

```json
{
  "question_id": "q1",
  "response": {
    "choice_ids": ["B"]
  },
  "answered_at": 1776210300,
  "client_meta": {}
}
```

Response shape varies by question kind:

- `multiple_choice`: `choice_ids[]`
- `true_false`: `boolean`
- `short_answer`: `text`
- `matching`: `pairs[]`

### Score report

```json
{
  "total_score": 16,
  "max_score": 20,
  "question_results": [],
  "competency_breakdown": [],
  "recommended_review": []
}
```

Each question result should include:

- `question_id`
- `awarded_points`
- `max_points`
- `is_correct`
- `feedback`
- `confidence`
- `matched_concepts[]`
- `missing_concepts[]`

Each competency breakdown should include:

- `competency_tag`
- `chapter`
- `section`
- `awarded_points`
- `max_points`
- `accuracy`
- `priority`

Each review recommendation should include:

- `chapter`
- `section`
- `competency_tag`
- `priority`
- `reason`

## API Design

The current `/quiz-results` route should not remain the primary persistence surface for exams.

### New API responsibilities

#### Create or materialize an exam

Use a route such as:

- `POST /api/v1/exams/from-session/{session_id}`

Purpose:

- materialize an `ExamArtifact` from a session result or exam-generation event
- normalize question schema before the UI starts an attempt

#### Create an attempt

- `POST /api/v1/exam-attempts`

Purpose:

- start a new attempt against an exam artifact
- record initial mode, timestamps, and status

#### Save draft answers

- `PATCH /api/v1/exam-attempts/{attempt_id}`

Purpose:

- persist in-progress answers
- support navigation, reconnects, and refresh recovery

#### Submit an attempt

- `POST /api/v1/exam-attempts/{attempt_id}/submit`

Purpose:

- lock answers
- trigger grading
- return `submitted`, `grading`, or `graded` state

#### Read an attempt

- `GET /api/v1/exam-attempts/{attempt_id}`

Purpose:

- display attempt state and score report
- support history and review pages

#### List attempts for a session

- `GET /api/v1/sessions/{session_id}/exam-attempts`

Purpose:

- show progress history related to the originating session

### Legacy route handling

`POST /api/v1/sessions/{session_id}/quiz-results` should be demoted to a compatibility surface for notebook workflows.

It may continue to:

- append a summary message
- upsert notebook entries

It should not remain the system of record for:

- attempt state
- final grading
- competency feedback
- progress analytics

## UI Design

### Viewer split

Introduce a new `ExamViewer` rather than stretching `QuizViewer` to cover the assessment lifecycle.

Reason:

- `QuizViewer` is optimized for learning and immediate answer checking
- `ExamViewer` must manage attempt lifecycle, deferred reveal, and score reports

Reusable UI pieces may still be extracted from the existing quiz components.

### Timed mode flow

Default behavior:

1. user opens an exam
2. UI creates or resumes an `in_progress` attempt
3. UI renders only prompt and answer inputs
4. user navigates between questions
5. answers are saved as drafts
6. user submits the full attempt
7. backend grades the attempt
8. UI reveals score report, answers, explanations, and study-plan handoff

Before submission, the UI must not reveal:

- correct answers
- hints
- explanations
- reference answers

### Practice mode flow

Practice mode uses the same domain model, but permits per-question submission and feedback.

Behavior:

- question-by-question checking is allowed
- attempts are still persisted
- score report remains available as a first-class outcome

### Input controls by question kind

- `multiple_choice`: radio or checkbox depending on `allow_multiple`
- `true_false`: radio toggle
- `short_answer`: text input or textarea
- `matching`: pair-mapping UI using dropdown or direct association control

## Grading Design

### Rule-based grading

Rule-based grading applies to:

- `multiple_choice`
- `true_false`
- `matching`

The backend is the source of truth for all final correctness decisions.

### Rubric-assisted LLM grading

Rubric-assisted grading applies to:

- `short_answer`

The scorer should return:

- `awarded_points`
- `max_points`
- `matched_concepts[]`
- `missing_concepts[]`
- `feedback`
- `confidence`

### Confidence semantics

Confidence must be surfaced in the score report so AI-assisted grading is transparent.

If confidence is low, the UI should communicate that:

- the result is machine-assisted
- review is recommended where appropriate

### Submission lifecycle

To avoid blocking the request path on slow grading, attempt submission should support:

- `submitted`
- `grading`
- `graded`

This allows the backend to grade synchronously when fast, or asynchronously when needed, without changing the public model later.

## Competency Feedback And Study Plan Handoff

Each exam question must carry:

- `chapter`
- `section`
- `competency_tags[]`

After grading, the backend should compute:

- score by chapter
- score by section
- score by competency
- prioritized weak areas

The UI should expose a direct action such as:

- `Create study plan from this result`

That action should invoke `course_assistant` study-plan generation with enriched context derived from the score report, including:

- weak chapters
- weak sections
- weak competencies
- incorrectly answered questions
- desired review priority

This keeps the study-plan handoff grounded in the learner's actual assessment result rather than a generic prompt.

## Persistence Design

Persistence should remain hybrid.

### Session timeline

Keep a lightweight summary in the session timeline so the chat history remains understandable and navigable.

Examples:

- exam created
- attempt submitted
- score summary recorded
- study plan created from result

### Dedicated attempt storage

Use dedicated storage for detailed attempt data.

The storage layer must preserve:

- exam artifact reference
- attempt status
- answer payloads
- timestamps
- score report
- study plan linkage

This storage becomes the source of truth for review and progress history.

## Compatibility And Migration

### Existing question model

The current frontend and capability artifacts use looser types such as:

- `choice`
- `written`
- `coding`

This design introduces a stricter assessment vocabulary:

- `multiple_choice`
- `true_false`
- `short_answer`
- `matching`

### Migration strategy

Add an adapter layer so existing artifacts can be normalized into the new exam schema.

Recommended mappings for rollout:

- `choice` -> `multiple_choice`
- `written` -> `short_answer`
- `coding` -> `short_answer` for initial assessment support unless a later coding-specific assessment type is introduced

This keeps the first rollout bounded while preserving compatibility with current generation flows.

## Implementation Phasing

The design is intentionally sized for incremental delivery.

### Phase 1

- add typed exam artifact model
- add exam attempt model and storage
- add exam attempt APIs
- add backend grading flow
- add `ExamViewer` for timed and practice modes
- keep legacy `QuizViewer` intact for existing quiz flows

### Phase 2

- add competency summary UX
- add study-plan handoff action
- add attempt history views in session detail or related UI

## Error Handling

The new flow should handle these cases explicitly:

- exam artifact cannot be normalized
- attempt not found
- attempt belongs to a different session context
- submit called on already submitted attempt
- grading fails after submission
- short-answer scoring returns low-confidence output

User-facing behavior should favor recoverability:

- preserve draft answers when possible
- make grading state visible
- show partial result states without data loss

## Testing Strategy

### Backend tests

- schema validation tests for each question kind
- course assistant runtime tests for normalized exam artifacts
- API tests for create, save, submit, and read attempt flows
- session-store tests for attempt persistence and retrieval
- compatibility tests for legacy `/quiz-results`

### Frontend tests

- answers are hidden before submit in timed mode
- timed mode reveals grading only after whole-test submission
- practice mode allows per-question reveal
- each question kind renders the correct control
- score report renders per-question and total outcomes
- study-plan handoff sends the expected payload

### Integration expectations

The most important invariant is:

- frontend may optimistically save answer drafts
- backend remains the source of truth for final grading and progress records

## Risks And Constraints

Main risks:

- matching and short-answer scoring can expand complexity quickly
- current artifact shapes are looser than the target schema
- synchronous LLM grading may create latency spikes
- frontend leakage of `grader_key` fields is easy if contracts stay implicit

Mitigations:

- keep typed `student_view` and `grader_key` boundaries explicit
- allow `grading` intermediate state
- use compatibility adapters during rollout
- keep notebook sync as secondary, not authoritative

## Out Of Scope For This Design

- proctoring
- anti-cheating enforcement
- timer enforcement beyond attempt lifecycle metadata
- full manual grading workflows
- a dedicated coding-assessment executor
- cross-course analytics dashboards

## Summary

The recommended upgrade is to turn exam mode into a first-class assessment system built around:

- typed exam artifacts
- dedicated attempt records
- backend-owned grading
- competency-aware feedback
- explicit study-plan handoff

This preserves current DeepTutor momentum while giving `exam` a clean path from generated questions to real assessment history.
