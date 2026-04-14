# Course Assistant Capability Design

Date: 2026-04-14
Status: Proposed and approved for planning

## Goal

Add a new built-in capability named `course_assistant` to DeepTutor that acts as a course-specific academic assistant for university teaching and learning workflows.

The MVP should support four modes:

- `qa`: answer course questions grounded in the selected knowledge base
- `exam`: generate quizzes or exercises with answer hints
- `study_plan`: generate a review plan or study checklist
- `summary`: summarize a chapter, section, or topic from the course materials

The capability must integrate cleanly with the existing DeepTutor architecture:

- capability registry
- unified request validation
- stream-based runtime
- knowledge base selection via existing `knowledge_bases` inputs
- existing CLI / WebSocket / SDK entry points

## Scope

### In scope for MVP

- One new built-in capability file at `deeptutor/capabilities/course_assistant.py`
- One new request config model and validator in `deeptutor/capabilities/request_contracts.py`
- Registration in `deeptutor/runtime/bootstrap/builtin_capabilities.py`
- Prompt templates for the new capability under `deeptutor/services/prompt/modules/course_assistant/`
- Runtime tests in `tests/core/test_capabilities_runtime.py`
- Structured stage streaming with four stages:
  - `understanding`
  - `processing`
  - `generating`
  - `result`
- Graceful handling for:
  - missing KB
  - invalid mode
  - RAG failures
  - LLM failures / timeouts

### Explicitly out of scope for MVP

- dedicated frontend UI
- session persistence specific to `course_assistant`
- user analytics / tracking
- long-running background jobs
- plugin extraction
- custom per-course memory beyond existing DeepTutor session/runtime behavior
- deep integration with TutorBot workflows

## Design Choice

The approved implementation strategy is a hybrid approach:

- `qa` mode will reuse existing chat-style RAG behavior conceptually, but the capability will remain responsible for its own request parsing, stage streaming, output packaging, and error handling.
- `exam`, `study_plan`, and `summary` will use mode-specific prompts and output shaping inside the new capability rather than delegating end-to-end to another capability.

This avoids making `course_assistant` a thin pass-through wrapper over other capabilities while still reusing existing DeepTutor infrastructure and conventions.

## High-Level Architecture

`course_assistant` is a built-in capability with one public entry point:

- input: `UnifiedContext`
- execution: `CourseAssistantCapability.run(context, stream)`
- output: stream events plus a final structured result payload

The capability will:

1. validate config
2. resolve the active course KB
3. branch by `mode`
4. gather grounded context through RAG when needed
5. call the LLM with a mode-specific prompt
6. emit a normalized result payload

## File Changes

### 1. New capability

Create:

- `deeptutor/capabilities/course_assistant.py`

Responsibilities:

- define `CourseAssistantCapability`
- publish `CapabilityManifest`
- validate request config
- resolve KB choice
- run the 4-stage pipeline
- call shared services for RAG and prompting
- package final outputs consistently

### 2. Request contract

Update:

- `deeptutor/capabilities/request_contracts.py`

Add:

- `CourseAssistantRequestConfig`
- `validate_course_assistant_request_config()`
- request schema registration
- validator registration

### 3. Built-in capability registration

Update:

- `deeptutor/runtime/bootstrap/builtin_capabilities.py`

Add:

- `"course_assistant": "deeptutor.capabilities.course_assistant:CourseAssistantCapability"`

### 4. Prompt templates

Create:

- `deeptutor/services/prompt/modules/course_assistant/qa_prompt.md`
- `deeptutor/services/prompt/modules/course_assistant/exam_generator.md`
- `deeptutor/services/prompt/modules/course_assistant/study_planner.md`
- `deeptutor/services/prompt/modules/course_assistant/summarizer.md`

These prompts are capability-owned assets and should be explicit about:

- expected grounding behavior
- expected output shape
- tone and audience
- fallback behavior when context is incomplete

### 5. Optional workspace path support

Possible update:

- `deeptutor/services/path_service.py`

This is optional for MVP. If the capability does not need private per-turn artifacts beyond the existing generic task workspace support, we should not add a dedicated workspace feature yet.

Recommendation:

- do not add `course_assistant` to `PathService` during MVP unless implementation reveals a concrete storage requirement

This keeps scope smaller and avoids unnecessary storage surface area.

### 6. Runtime tests

Update:

- `tests/core/test_capabilities_runtime.py`

Add focused tests for:

- `qa`
- `exam`
- `study_plan`

`summary` test is recommended if straightforward to isolate, but not required if it would duplicate too much test scaffolding in MVP.

## Request Config

The capability config should be strict and reject unknown fields.

Proposed request model:

```python
class CourseAssistantRequestConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["qa", "exam", "study_plan", "summary"] = "qa"
    kb_name: str = ""
    top_k: int = Field(default=5, ge=1, le=20)
    num_questions: int = Field(default=3, ge=1, le=20)
    difficulty: str = ""
    question_type: str = ""
    chapter: str = ""
    section: str = ""
    output_format: Literal["markdown", "json"] = "markdown"
    include_sources: bool = True
```

### Semantics

- `mode`: execution branch selector
- `kb_name`: explicit KB override; if empty, fallback to `context.knowledge_bases[0]`
- `top_k`: number of RAG chunks to fetch
- `num_questions`: number of generated questions in `exam` mode
- `difficulty`: optional exam difficulty hint
- `question_type`: optional exam style hint
- `chapter`: chapter filter for `summary` or `study_plan`
- `section`: section filter for `summary`
- `output_format`: final response formatting preference
- `include_sources`: include normalized sources in final payload when applicable

## KB Resolution Rules

The active KB should be resolved in the following order:

1. `config.kb_name` if present and non-empty
2. `context.knowledge_bases[0]` if available
3. otherwise fail with a clear capability error

Failure message should explicitly tell the caller that `course_assistant` requires a selected knowledge base for course-grounded behavior.

## Pipeline Design

Each request goes through the same stage skeleton.

### Stage 1: `understanding`

Responsibilities:

- validate request config
- normalize mode
- resolve KB
- derive the task intent from `context.user_message`
- validate mode-specific preconditions

Examples of precondition checks:

- `qa`: non-empty user question
- `exam`: positive `num_questions`
- `study_plan`: non-empty user request or a valid chapter hint
- `summary`: at least one of `user_message`, `chapter`, or `section`

Streaming:

- emit a short progress event describing the recognized task

### Stage 2: `processing`

Responsibilities:

- retrieve relevant KB context using RAG
- transform retrieved context into a compact prompt-ready grounding block
- keep normalized source metadata for final output

Mode-specific retrieval behavior:

- `qa`: retrieve directly against the user question
- `exam`: retrieve syllabus/content context for the requested topic and difficulty
- `study_plan`: retrieve high-level chapter/topic structure and review-relevant passages
- `summary`: retrieve content matching the requested chapter/section/topic

If retrieval returns nothing, the capability should not crash. It should continue with a degraded response when possible, but mark that grounding quality is low in the metadata.

### Stage 3: `generating`

Responsibilities:

- load the mode-specific prompt
- compose the final LLM input
- invoke the LLM once for MVP
- parse the result into normalized output fields

Mode-specific generation contracts:

- `qa`
  - concise but grounded answer
  - cite or reference retrieved materials
- `exam`
  - generate `num_questions` questions
  - each question should include:
    - prompt
    - type
    - difficulty if known
    - answer or hint
- `study_plan`
  - produce a review structure that can be rendered as markdown or JSON
  - preferred structure:
    - weeks or sessions
    - topics
    - goals
    - optional checkpoints
- `summary`
  - structured summary of the requested topic
  - preferred sections:
    - overview
    - key concepts
    - important formulas or facts when present
    - common mistakes or review notes when present

### Stage 4: `result`

Responsibilities:

- emit final content
- emit final `stream.result(...)`
- include normalized metadata and optional sources

## Output Contract

All modes should return a common top-level payload:

```json
{
  "mode": "qa",
  "response": "Final user-facing answer",
  "sources": [],
  "artifacts": {},
  "metadata": {}
}
```

### Field meanings

- `mode`: resolved capability mode
- `response`: primary human-readable answer
- `sources`: normalized grounding references
- `artifacts`: machine-friendly mode-specific payload
- `metadata`: diagnostic or execution details safe to expose

### Mode-specific `artifacts`

- `qa`
  - optional `artifacts.retrieval_summary`
- `exam`
  - `artifacts.questions`
- `study_plan`
  - `artifacts.plan`
- `summary`
  - `artifacts.summary`

## Prompt Strategy

The prompt files under `services/prompt/modules/course_assistant/` should be plain, capability-scoped templates rather than giant shared prompt abstractions.

Prompt design rules:

- prefer grounded outputs over broad speculation
- say when KB evidence is insufficient
- avoid inventing chapter names if not supported by KB context
- keep exam questions aligned to retrieved course materials
- keep study plans realistic for revision workflows
- keep summaries compact and course-oriented

## Error Handling

The capability must fail gracefully and predictably.

### Required cases

- unknown mode
- no KB selected
- KB not found
- RAG retrieval exception
- LLM exception
- malformed config

### Error response behavior

- emit `stream.error(...)` with a clear, user-facing message
- avoid stack traces in user-facing payloads
- include limited debug details in `metadata` only when appropriate
- do not emit partial success unless the partial output is clearly labeled

## Logging

The capability should add lightweight but useful logs:

- resolved mode
- resolved KB
- retrieval success/failure and count of retrieved items
- generation start / completion
- degraded fallback paths

Logging should be sufficient for debugging behavior without dumping entire sensitive prompts or course material by default.

## Testing Strategy

Update `tests/core/test_capabilities_runtime.py` with isolated runtime tests similar in style to existing capability tests.

### Required MVP tests

#### 1. Q&A mode

Input:

- user question
- selected KB

Expected:

- emits progress events across expected stages
- returns grounded answer content
- includes source metadata when enabled

#### 2. Exam mode

Input:

- request to generate 3 questions
- selected KB

Expected:

- result payload contains `artifacts.questions`
- question count is 3
- each generated item includes at least prompt plus answer or hint

#### 3. Study plan mode

Input:

- request to generate a review plan
- selected KB

Expected:

- result payload contains `artifacts.plan`
- plan is structured and non-empty

### Nice-to-have MVP test

#### 4. Summary mode

Input:

- chapter or topic request

Expected:

- result payload contains `artifacts.summary`
- summary text is non-empty

## CLI / API Behavior

The capability should be invocable through existing entry points without requiring new transport logic.

Examples:

```bash
deeptutor run course_assistant "Giải thích overfitting" --kb ai-course --config mode=qa
deeptutor run course_assistant "Sinh 3 câu hỏi về hồi quy tuyến tính" --kb ai-course --config mode=exam --config num_questions=3
deeptutor run course_assistant "Tạo lộ trình ôn tập môn AI" --kb ai-course --config mode=study_plan
deeptutor run course_assistant "Tóm tắt chương học sâu" --kb ai-course --config mode=summary --config chapter="Học sâu"
```

WebSocket and SDK callers should use the same capability name and config structure already supported by the unified runtime.

## Compatibility Rules

The new capability must preserve compatibility with the existing DeepTutor architecture:

- no breaking changes to existing capabilities
- no KB storage format changes
- no transport-level API changes required
- use the same runtime validation and manifest registration conventions as other built-in capabilities

## Implementation Order

Recommended implementation order:

1. capability skeleton + manifest + registration
2. request config + schema registration
3. `qa` mode with RAG grounding
4. `exam` mode with structured artifacts
5. `study_plan` mode
6. `summary` mode
7. tests and refinement

This preserves the approved priority of getting Q&A working first and reduces integration risk.

## Risks And Mitigations

### Risk: over-coupling to existing chat/deep_question internals

Mitigation:

- keep `course_assistant` in control of its own output contract
- reuse services, not opaque end-to-end capability calls

### Risk: unstable output shapes across modes

Mitigation:

- enforce one normalized top-level result contract
- keep mode-specific details under `artifacts`

### Risk: KB retrieval may be sparse or noisy

Mitigation:

- allow degraded but explicit fallback behavior
- include source metadata and grounding-quality notes

### Risk: MVP scope creep

Mitigation:

- no dedicated UI
- no persistence work unless forced by implementation
- no extra storage features unless a concrete need appears

## Final Recommendation

Proceed with the hybrid MVP design:

- one new built-in capability
- strict request contract
- mode-specific prompt assets
- normalized output contract
- four-stage streaming
- Q&A first, then exam, then study plan and summary

This is the smallest design that still feels like a real course-oriented capability rather than a thin alias over existing DeepTutor modes.
