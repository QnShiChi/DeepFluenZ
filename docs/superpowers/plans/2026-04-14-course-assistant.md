# Course Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new built-in `course_assistant` capability that provides course-grounded Q&A, exam generation, study plans, and summaries using the existing DeepTutor runtime and knowledge base infrastructure.

**Architecture:** The capability is a single orchestrator at `deeptutor/capabilities/course_assistant.py` with four modes: `qa`, `exam`, `study_plan`, and `summary`. It validates strict request config in `deeptutor/capabilities/request_contracts.py`, resolves a KB from config or context, uses the built-in `rag` tool for grounding, uses `sdk_complete()` for mode-specific LLM generation, loads Markdown prompt templates from `deeptutor/services/prompt/modules/course_assistant/`, and emits normalized `StreamBus` events across `understanding`, `processing`, `generating`, and `result`.

**Tech Stack:** Python 3.11+, Pydantic v2, DeepTutor capability runtime, built-in ToolRegistry, RAGService through the `rag` tool, OpenAI-compatible LLM execution via `deeptutor.services.llm.executors.sdk_complete`, pytest.

---

## File Structure

### New files

- `deeptutor/capabilities/course_assistant.py`
  - New `CourseAssistantCapability` implementation.
  - Contains request execution, KB resolution, prompt loading, RAG retrieval, LLM call, result packaging, and error handling.
- `deeptutor/services/prompt/modules/course_assistant/qa_prompt.md`
  - Prompt template for grounded course Q&A.
- `deeptutor/services/prompt/modules/course_assistant/exam_generator.md`
  - Prompt template for question/exam generation.
- `deeptutor/services/prompt/modules/course_assistant/study_planner.md`
  - Prompt template for review plan generation.
- `deeptutor/services/prompt/modules/course_assistant/summarizer.md`
  - Prompt template for chapter/topic summary generation.
- `tests/agents/course_assistant/test_request_config.py`
  - Unit tests for strict request config validation and defaults.

### Modified files

- `deeptutor/capabilities/request_contracts.py`
  - Add request model, validator, schema registration, and exports.
- `deeptutor/runtime/bootstrap/builtin_capabilities.py`
  - Register the new capability class path.
- `tests/core/test_capabilities_runtime.py`
  - Add isolated runtime tests for `qa`, `exam`, and `study_plan` modes.

### No-change decisions

- `deeptutor/services/path_service.py`
  - Leave untouched for MVP.
- transport layers such as CLI/WebSocket routers
  - No transport-specific code should be added; capability registration is sufficient.

## Implementation Notes

- Use the built-in `rag` tool via `get_tool_registry().execute("rag", ...)` instead of reaching directly into RAG internals.
- Use `sdk_complete()` from `deeptutor.services.llm.executors` for LLM generation instead of inventing a new client path.
- Keep prompt loading local to the new capability because `PromptManager` currently targets YAML files under agent prompt directories, while this feature uses Markdown templates under `deeptutor/services/prompt/modules/course_assistant/`.
- Return one normalized result payload for all modes:

```python
{
    "mode": "qa",
    "response": "Final user-facing answer",
    "sources": [],
    "artifacts": {},
    "metadata": {
        "kb_name": "ai-course",
        "retrieved_count": 3,
        "degraded": False,
    },
}
```

- Keep all generation single-call for MVP. No background jobs, no planner sub-pipeline, no persistence.

### Task 1: Add Strict Request Config Support

**Files:**
- Create: `tests/agents/course_assistant/test_request_config.py`
- Modify: `deeptutor/capabilities/request_contracts.py`

- [ ] **Step 1: Write the failing request-config tests**

```python
from deeptutor.capabilities.request_contracts import (
    validate_capability_config,
    validate_course_assistant_request_config,
)


def test_validate_course_assistant_request_config_defaults() -> None:
    config = validate_course_assistant_request_config(None)

    assert config.mode == "qa"
    assert config.kb_name == ""
    assert config.top_k == 5
    assert config.num_questions == 3
    assert config.output_format == "markdown"
    assert config.include_sources is True


def test_validate_course_assistant_request_config_rejects_unknown_fields() -> None:
    try:
        validate_course_assistant_request_config({"mode": "qa", "unexpected": True})
    except ValueError as exc:
        assert "Invalid course assistant config" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unknown field")


def test_validate_capability_config_supports_course_assistant() -> None:
    config = validate_capability_config(
        "course_assistant",
        {"mode": "exam", "num_questions": 4, "include_sources": False},
    )

    assert config == {
        "mode": "exam",
        "kb_name": "",
        "top_k": 5,
        "num_questions": 4,
        "difficulty": "",
        "question_type": "",
        "chapter": "",
        "section": "",
        "output_format": "markdown",
        "include_sources": False,
    }
```

- [ ] **Step 2: Run the request-config tests to verify they fail**

Run: `pytest tests/agents/course_assistant/test_request_config.py -v`

Expected: FAIL with import errors or missing `validate_course_assistant_request_config`.

- [ ] **Step 3: Add the request config model and validator**

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


def validate_course_assistant_request_config(
    raw_config: dict[str, Any] | None,
) -> CourseAssistantRequestConfig:
    return _validate_model(
        CourseAssistantRequestConfig,
        raw_config,
        label="course assistant",
    )


CAPABILITY_CONFIG_VALIDATORS: dict[str, Callable[[dict[str, Any] | None], Any]] = {
    "chat": validate_chat_request_config,
    "deep_solve": validate_deep_solve_request_config,
    "deep_question": validate_deep_question_request_config,
    "deep_research": validate_research_request_config,
    "math_animator": validate_math_animator_request_config,
    "visualize": validate_visualize_request_config,
    "course_assistant": validate_course_assistant_request_config,
}

CAPABILITY_REQUEST_SCHEMAS: dict[str, dict[str, Any]] = {
    "chat": build_request_schema(ChatRequestConfig),
    "deep_solve": build_request_schema(DeepSolveRequestConfig),
    "deep_question": build_request_schema(DeepQuestionRequestConfig),
    "deep_research": build_request_schema(DeepResearchRequestConfig),
    "math_animator": build_request_schema(MathAnimatorRequestConfig),
    "visualize": build_request_schema(VisualizeRequestConfig),
    "course_assistant": build_request_schema(CourseAssistantRequestConfig),
}
```

- [ ] **Step 4: Run the request-config tests to verify they pass**

Run: `pytest tests/agents/course_assistant/test_request_config.py -v`

Expected: PASS with 3 passed.

- [ ] **Step 5: Commit the request contract work**

```bash
git add tests/agents/course_assistant/test_request_config.py deeptutor/capabilities/request_contracts.py
git commit -m "feat: add course assistant request config"
```

### Task 2: Add QA Runtime Test and Capability Skeleton

**Files:**
- Modify: `tests/core/test_capabilities_runtime.py`
- Create: `deeptutor/capabilities/course_assistant.py`

- [ ] **Step 1: Write the failing QA runtime test**

```python
from deeptutor.capabilities.course_assistant import CourseAssistantCapability
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream import StreamEventType


@pytest.mark.asyncio
async def test_course_assistant_qa_mode_streams_grounded_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeToolRegistry:
        async def execute(self, name: str, **kwargs: Any):
            assert name == "rag"
            assert kwargs["query"] == "What is overfitting?"
            assert kwargs["kb_name"] == "ai-course"
            return SimpleNamespace(
                content="Overfitting is when a model memorizes training data.",
                metadata={
                    "answer": "Overfitting is when a model memorizes training data.",
                    "sources": [{"title": "Lecture 5", "content": "Overfitting happens ..."}],
                },
                sources=[{"type": "rag", "kb_name": "ai-course", "query": "What is overfitting?"}],
            )

    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.get_tool_registry",
        lambda: FakeToolRegistry(),
    )
    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.get_llm_config",
        lambda: SimpleNamespace(
            binding="openrouter",
            model="openai/gpt-4o-mini",
            api_key="k",
            base_url="https://example.com/v1",
            api_version=None,
        ),
    )
    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.sdk_complete",
        lambda **kwargs: asyncio.sleep(0, result="Overfitting happens when the model memorizes the training data instead of generalizing."),
    )

    context = UnifiedContext(
        user_message="What is overfitting?",
        active_capability="course_assistant",
        knowledge_bases=["ai-course"],
        config_overrides={"mode": "qa"},
        language="en",
    )

    capability = CourseAssistantCapability()
    events = await _collect_events(lambda bus: capability.run(context, bus))

    assert any(event.type == StreamEventType.PROGRESS and event.stage == "understanding" for event in events)
    assert any(event.type == StreamEventType.PROGRESS and event.stage == "processing" for event in events)
    assert any(event.type == StreamEventType.CONTENT and "memorizes the training data" in event.content for event in events)
    result_event = next(event for event in events if event.type == StreamEventType.RESULT)
    assert result_event.metadata["mode"] == "qa"
    assert result_event.metadata["metadata"]["kb_name"] == "ai-course"
    assert result_event.metadata["sources"][0]["type"] == "rag"
```

- [ ] **Step 2: Run the QA runtime test to verify it fails**

Run: `pytest tests/core/test_capabilities_runtime.py::test_course_assistant_qa_mode_streams_grounded_answer -v`

Expected: FAIL because `CourseAssistantCapability` does not exist.

- [ ] **Step 3: Create the capability skeleton and QA mode**

```python
class CourseAssistantCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="course_assistant",
        description="Course-grounded assistant for Q&A, exam generation, study plans, and summaries.",
        stages=["understanding", "processing", "generating", "result"],
        tools_used=["rag"],
        cli_aliases=["course_assistant"],
        request_schema=get_capability_request_schema("course_assistant"),
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        config = validate_course_assistant_request_config(context.config_overrides)
        kb_name = self._resolve_kb_name(context, config)
        await stream.progress(
            message=f"Understanding {config.mode} request for {kb_name}.",
            source=self.name,
            stage="understanding",
        )
        if config.mode == "qa":
            payload = await self._run_qa(context, config, kb_name, stream)
        elif config.mode == "exam":
            payload = await self._run_exam(context, config, kb_name, stream)
        elif config.mode == "study_plan":
            payload = await self._run_study_plan(context, config, kb_name, stream)
        else:
            payload = await self._run_summary(context, config, kb_name, stream)

        await stream.content(payload["response"], source=self.name, stage="result")
        await stream.result(payload, source=self.name)
```

```python
async def _run_qa(
    self,
    context: UnifiedContext,
    config: CourseAssistantRequestConfig,
    kb_name: str,
    stream: StreamBus,
) -> dict[str, Any]:
    await stream.progress(
        message=f"Retrieving course context from {kb_name}.",
        source=self.name,
        stage="processing",
    )
    rag_result = await get_tool_registry().execute(
        "rag",
        query=context.user_message,
        kb_name=kb_name,
        top_k=config.top_k,
    )
    sources = list(rag_result.sources or [])
    grounded_context = str(rag_result.content or "")

    await stream.progress(
        message="Generating grounded answer.",
        source=self.name,
        stage="generating",
    )
    llm_config = get_llm_config()
    answer = await sdk_complete(
        prompt=self._render_prompt(
            "qa_prompt.md",
            user_message=context.user_message,
            kb_name=kb_name,
            grounded_context=grounded_context,
        ),
        system_prompt="You are a course assistant.",
        provider_name=llm_config.binding,
        model=llm_config.model,
        api_key=llm_config.api_key,
        base_url=llm_config.base_url,
        api_version=llm_config.api_version,
    )

    return {
        "mode": "qa",
        "response": answer,
        "sources": sources if config.include_sources else [],
        "artifacts": {
            "retrieval_summary": grounded_context[:500],
        },
        "metadata": {
            "kb_name": kb_name,
            "retrieved_count": len((rag_result.metadata or {}).get("sources", []) or sources),
            "degraded": not bool(grounded_context.strip()),
        },
    }
```

- [ ] **Step 4: Run the QA runtime test to verify it passes**

Run: `pytest tests/core/test_capabilities_runtime.py::test_course_assistant_qa_mode_streams_grounded_answer -v`

Expected: PASS.

- [ ] **Step 5: Commit the capability skeleton**

```bash
git add tests/core/test_capabilities_runtime.py deeptutor/capabilities/course_assistant.py
git commit -m "feat: add course assistant qa mode"
```

### Task 3: Add Prompt Assets and Exam Mode

**Files:**
- Modify: `tests/core/test_capabilities_runtime.py`
- Modify: `deeptutor/capabilities/course_assistant.py`
- Create: `deeptutor/services/prompt/modules/course_assistant/qa_prompt.md`
- Create: `deeptutor/services/prompt/modules/course_assistant/exam_generator.md`
- Create: `deeptutor/services/prompt/modules/course_assistant/study_planner.md`
- Create: `deeptutor/services/prompt/modules/course_assistant/summarizer.md`

- [ ] **Step 1: Add prompt template files**

```md
# qa_prompt.md
You are a university course assistant.

Knowledge base: {kb_name}

Use the grounded course material below to answer the student's question.
If the material is incomplete, say so explicitly.

Question:
{user_message}

Grounded context:
{grounded_context}
```

```md
# exam_generator.md
You are a university course assistant generating practice questions.

Knowledge base: {kb_name}
Requested count: {num_questions}
Difficulty hint: {difficulty}
Question type hint: {question_type}

Use the course material below. Return JSON with a top-level `questions` list.
Each item must include `prompt`, `type`, and `answer_hint`.

User request:
{user_message}

Grounded context:
{grounded_context}
```

```md
# study_planner.md
You are a university course assistant creating a revision plan.

Knowledge base: {kb_name}
Chapter hint: {chapter}

Use the course material below. Return JSON with a top-level `plan` list.
Each item should include `title`, `topics`, and `goal`.

User request:
{user_message}

Grounded context:
{grounded_context}
```

```md
# summarizer.md
You are a university course assistant summarizing course content.

Knowledge base: {kb_name}
Chapter hint: {chapter}
Section hint: {section}

Use the course material below to create a structured summary.

User request:
{user_message}

Grounded context:
{grounded_context}
```

- [ ] **Step 2: Write the failing exam runtime test**

```python
@pytest.mark.asyncio
async def test_course_assistant_exam_mode_returns_questions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeToolRegistry:
        async def execute(self, name: str, **kwargs: Any):
            assert name == "rag"
            return SimpleNamespace(
                content="Linear regression, logistic regression, decision trees.",
                metadata={"sources": [{"title": "ML Basics"}]},
                sources=[{"type": "rag", "kb_name": "ai-course", "query": kwargs["query"]}],
            )

    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.get_tool_registry",
        lambda: FakeToolRegistry(),
    )
    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.get_llm_config",
        lambda: SimpleNamespace(
            binding="openrouter",
            model="openai/gpt-4o-mini",
            api_key="k",
            base_url="https://example.com/v1",
            api_version=None,
        ),
    )
    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.sdk_complete",
        lambda **kwargs: asyncio.sleep(
            0,
            result='{"questions":[{"prompt":"Q1","type":"short_answer","answer_hint":"A1"},{"prompt":"Q2","type":"multiple_choice","answer_hint":"A2"},{"prompt":"Q3","type":"short_answer","answer_hint":"A3"}]}',
        ),
    )

    context = UnifiedContext(
        user_message="Generate 3 questions about basic machine learning algorithms.",
        active_capability="course_assistant",
        knowledge_bases=["ai-course"],
        config_overrides={"mode": "exam", "num_questions": 3},
        language="en",
    )

    capability = CourseAssistantCapability()
    events = await _collect_events(lambda bus: capability.run(context, bus))

    result_event = next(event for event in events if event.type == StreamEventType.RESULT)
    assert result_event.metadata["mode"] == "exam"
    assert len(result_event.metadata["artifacts"]["questions"]) == 3
    assert result_event.metadata["artifacts"]["questions"][0]["answer_hint"] == "A1"
```

- [ ] **Step 3: Run the exam runtime test to verify it fails**

Run: `pytest tests/core/test_capabilities_runtime.py::test_course_assistant_exam_mode_returns_questions -v`

Expected: FAIL because exam mode is not implemented or returns the wrong payload shape.

- [ ] **Step 4: Implement prompt loading helpers and exam mode**

```python
def _prompt_dir(self) -> Path:
    return (
        Path(__file__).resolve().parent.parent
        / "services"
        / "prompt"
        / "modules"
        / "course_assistant"
    )


def _load_prompt_template(self, name: str) -> str:
    path = self._prompt_dir() / name
    return path.read_text(encoding="utf-8")


def _render_prompt(self, name: str, **values: Any) -> str:
    template = self._load_prompt_template(name)
    return template.format(**values)
```

```python
async def _run_exam(
    self,
    context: UnifiedContext,
    config: CourseAssistantRequestConfig,
    kb_name: str,
    stream: StreamBus,
) -> dict[str, Any]:
    await stream.progress(
        message=f"Retrieving exam context from {kb_name}.",
        source=self.name,
        stage="processing",
    )
    rag_result = await get_tool_registry().execute(
        "rag",
        query=context.user_message,
        kb_name=kb_name,
        top_k=config.top_k,
    )
    grounded_context = str(rag_result.content or "")

    await stream.progress(
        message=f"Generating {config.num_questions} questions.",
        source=self.name,
        stage="generating",
    )
    llm_config = get_llm_config()
    raw = await sdk_complete(
        prompt=self._render_prompt(
            "exam_generator.md",
            user_message=context.user_message,
            kb_name=kb_name,
            grounded_context=grounded_context,
            num_questions=config.num_questions,
            difficulty=config.difficulty,
            question_type=config.question_type,
        ),
        system_prompt="You are a course assistant.",
        provider_name=llm_config.binding,
        model=llm_config.model,
        api_key=llm_config.api_key,
        base_url=llm_config.base_url,
        api_version=llm_config.api_version,
    )
    parsed = json.loads(raw)
    questions = list(parsed.get("questions", []))
    response = "\n\n".join(
        f"{idx + 1}. {item['prompt']}\nHint: {item['answer_hint']}"
        for idx, item in enumerate(questions)
    )
    return {
        "mode": "exam",
        "response": response,
        "sources": list(rag_result.sources or []) if config.include_sources else [],
        "artifacts": {"questions": questions},
        "metadata": {
            "kb_name": kb_name,
            "retrieved_count": len((rag_result.metadata or {}).get("sources", [])),
            "degraded": not bool(grounded_context.strip()),
        },
    }
```

- [ ] **Step 5: Run the exam runtime test to verify it passes**

Run: `pytest tests/core/test_capabilities_runtime.py::test_course_assistant_exam_mode_returns_questions -v`

Expected: PASS.

- [ ] **Step 6: Commit prompt assets and exam mode**

```bash
git add deeptutor/capabilities/course_assistant.py deeptutor/services/prompt/modules/course_assistant/*.md tests/core/test_capabilities_runtime.py
git commit -m "feat: add course assistant exam mode"
```

### Task 4: Add Study Plan and Summary Modes

**Files:**
- Modify: `tests/core/test_capabilities_runtime.py`
- Modify: `deeptutor/capabilities/course_assistant.py`

- [ ] **Step 1: Write the failing study-plan runtime test**

```python
@pytest.mark.asyncio
async def test_course_assistant_study_plan_mode_returns_plan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeToolRegistry:
        async def execute(self, name: str, **kwargs: Any):
            return SimpleNamespace(
                content="Week 1: AI intro. Week 2: ML basics. Week 3: data preprocessing.",
                metadata={"sources": [{"title": "Course outline"}]},
                sources=[{"type": "rag", "kb_name": "ai-course", "query": kwargs["query"]}],
            )

    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.get_tool_registry",
        lambda: FakeToolRegistry(),
    )
    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.get_llm_config",
        lambda: SimpleNamespace(
            binding="openrouter",
            model="openai/gpt-4o-mini",
            api_key="k",
            base_url="https://example.com/v1",
            api_version=None,
        ),
    )
    monkeypatch.setattr(
        "deeptutor.capabilities.course_assistant.sdk_complete",
        lambda **kwargs: asyncio.sleep(
            0,
            result='{"plan":[{"title":"Week 1","topics":["AI introduction"],"goal":"Understand definitions"},{"title":"Week 2","topics":["Machine learning basics"],"goal":"Review core algorithms"}]}',
        ),
    )

    context = UnifiedContext(
        user_message="Create a revision plan for the AI course.",
        active_capability="course_assistant",
        knowledge_bases=["ai-course"],
        config_overrides={"mode": "study_plan"},
        language="en",
    )

    capability = CourseAssistantCapability()
    events = await _collect_events(lambda bus: capability.run(context, bus))

    result_event = next(event for event in events if event.type == StreamEventType.RESULT)
    assert result_event.metadata["mode"] == "study_plan"
    assert result_event.metadata["artifacts"]["plan"][0]["title"] == "Week 1"
    assert "Week 1" in result_event.metadata["response"]
```

- [ ] **Step 2: Run the study-plan runtime test to verify it fails**

Run: `pytest tests/core/test_capabilities_runtime.py::test_course_assistant_study_plan_mode_returns_plan -v`

Expected: FAIL because study-plan mode is not implemented.

- [ ] **Step 3: Implement study-plan and summary modes**

```python
async def _run_study_plan(
    self,
    context: UnifiedContext,
    config: CourseAssistantRequestConfig,
    kb_name: str,
    stream: StreamBus,
) -> dict[str, Any]:
    await stream.progress(
        message=f"Retrieving planning context from {kb_name}.",
        source=self.name,
        stage="processing",
    )
    rag_result = await get_tool_registry().execute(
        "rag",
        query=context.user_message or f"Study plan for {config.chapter}",
        kb_name=kb_name,
        top_k=config.top_k,
    )
    grounded_context = str(rag_result.content or "")

    await stream.progress(
        message="Generating study plan.",
        source=self.name,
        stage="generating",
    )
    llm_config = get_llm_config()
    raw = await sdk_complete(
        prompt=self._render_prompt(
            "study_planner.md",
            user_message=context.user_message,
            kb_name=kb_name,
            grounded_context=grounded_context,
            chapter=config.chapter,
        ),
        system_prompt="You are a course assistant.",
        provider_name=llm_config.binding,
        model=llm_config.model,
        api_key=llm_config.api_key,
        base_url=llm_config.base_url,
        api_version=llm_config.api_version,
    )
    parsed = json.loads(raw)
    plan = list(parsed.get("plan", []))
    response = "\n\n".join(
        f"{item['title']}\nTopics: {', '.join(item['topics'])}\nGoal: {item['goal']}"
        for item in plan
    )
    return {
        "mode": "study_plan",
        "response": response,
        "sources": list(rag_result.sources or []) if config.include_sources else [],
        "artifacts": {"plan": plan},
        "metadata": {
            "kb_name": kb_name,
            "retrieved_count": len((rag_result.metadata or {}).get("sources", [])),
            "degraded": not bool(grounded_context.strip()),
        },
    }


async def _run_summary(
    self,
    context: UnifiedContext,
    config: CourseAssistantRequestConfig,
    kb_name: str,
    stream: StreamBus,
) -> dict[str, Any]:
    query = context.user_message or " ".join(part for part in [config.chapter, config.section] if part).strip()
    await stream.progress(
        message=f"Retrieving summary context from {kb_name}.",
        source=self.name,
        stage="processing",
    )
    rag_result = await get_tool_registry().execute(
        "rag",
        query=query,
        kb_name=kb_name,
        top_k=config.top_k,
    )
    grounded_context = str(rag_result.content or "")

    await stream.progress(
        message="Generating summary.",
        source=self.name,
        stage="generating",
    )
    llm_config = get_llm_config()
    summary_text = await sdk_complete(
        prompt=self._render_prompt(
            "summarizer.md",
            user_message=context.user_message,
            kb_name=kb_name,
            grounded_context=grounded_context,
            chapter=config.chapter,
            section=config.section,
        ),
        system_prompt="You are a course assistant.",
        provider_name=llm_config.binding,
        model=llm_config.model,
        api_key=llm_config.api_key,
        base_url=llm_config.base_url,
        api_version=llm_config.api_version,
    )
    return {
        "mode": "summary",
        "response": summary_text,
        "sources": list(rag_result.sources or []) if config.include_sources else [],
        "artifacts": {"summary": summary_text},
        "metadata": {
            "kb_name": kb_name,
            "retrieved_count": len((rag_result.metadata or {}).get("sources", [])),
            "degraded": not bool(grounded_context.strip()),
        },
    }
```

- [ ] **Step 4: Run the study-plan runtime test to verify it passes**

Run: `pytest tests/core/test_capabilities_runtime.py::test_course_assistant_study_plan_mode_returns_plan -v`

Expected: PASS.

- [ ] **Step 5: Commit study-plan and summary modes**

```bash
git add deeptutor/capabilities/course_assistant.py tests/core/test_capabilities_runtime.py
git commit -m "feat: add course assistant study plan and summary modes"
```

### Task 5: Register Capability and Add Error-Handling Coverage

**Files:**
- Modify: `deeptutor/runtime/bootstrap/builtin_capabilities.py`
- Modify: `tests/core/test_capabilities_runtime.py`
- Modify: `deeptutor/capabilities/course_assistant.py`

- [ ] **Step 1: Write the failing registration and error-handling tests**

```python
def test_course_assistant_registered_in_builtin_capabilities() -> None:
    from deeptutor.runtime.bootstrap.builtin_capabilities import BUILTIN_CAPABILITY_CLASSES

    assert BUILTIN_CAPABILITY_CLASSES["course_assistant"] == (
        "deeptutor.capabilities.course_assistant:CourseAssistantCapability"
    )


@pytest.mark.asyncio
async def test_course_assistant_errors_when_kb_missing() -> None:
    context = UnifiedContext(
        user_message="What is overfitting?",
        active_capability="course_assistant",
        knowledge_bases=[],
        config_overrides={"mode": "qa"},
        language="en",
    )

    capability = CourseAssistantCapability()
    events = await _collect_events(lambda bus: capability.run(context, bus))

    error_event = next(event for event in events if event.type == StreamEventType.ERROR)
    assert "requires a selected knowledge base" in error_event.content
```

- [ ] **Step 2: Run the registration/error tests to verify they fail**

Run: `pytest tests/core/test_capabilities_runtime.py -k "course_assistant_registered_in_builtin_capabilities or course_assistant_errors_when_kb_missing" -v`

Expected: FAIL because registration is missing and KB error behavior is incomplete.

- [ ] **Step 3: Implement registration and error handling**

```python
BUILTIN_CAPABILITY_CLASSES: dict[str, str] = {
    "chat": "deeptutor.capabilities.chat:ChatCapability",
    "deep_solve": "deeptutor.capabilities.deep_solve:DeepSolveCapability",
    "deep_question": "deeptutor.capabilities.deep_question:DeepQuestionCapability",
    "deep_research": "deeptutor.capabilities.deep_research:DeepResearchCapability",
    "math_animator": "deeptutor.capabilities.math_animator:MathAnimatorCapability",
    "visualize": "deeptutor.capabilities.visualize:VisualizeCapability",
    "course_assistant": "deeptutor.capabilities.course_assistant:CourseAssistantCapability",
}
```

```python
def _resolve_kb_name(
    self,
    context: UnifiedContext,
    config: CourseAssistantRequestConfig,
) -> str:
    kb_name = str(config.kb_name or "").strip()
    if not kb_name and context.knowledge_bases:
        kb_name = str(context.knowledge_bases[0] or "").strip()
    if not kb_name:
        raise RuntimeError(
            "course_assistant requires a selected knowledge base. "
            "Pass `--kb <name>` or set `config.kb_name`."
        )
    return kb_name
```

```python
try:
    payload = await self._run_mode(context, config, kb_name, stream)
except Exception as exc:
    await stream.error(str(exc), source=self.name, stage="result")
    return
```

- [ ] **Step 4: Run the registration/error tests to verify they pass**

Run: `pytest tests/core/test_capabilities_runtime.py -k "course_assistant_registered_in_builtin_capabilities or course_assistant_errors_when_kb_missing" -v`

Expected: PASS.

- [ ] **Step 5: Commit registration and error handling**

```bash
git add deeptutor/runtime/bootstrap/builtin_capabilities.py deeptutor/capabilities/course_assistant.py tests/core/test_capabilities_runtime.py
git commit -m "feat: register course assistant capability"
```

### Task 6: Run Final Verification

**Files:**
- Verify only:
  - `deeptutor/capabilities/course_assistant.py`
  - `deeptutor/capabilities/request_contracts.py`
  - `deeptutor/runtime/bootstrap/builtin_capabilities.py`
  - `deeptutor/services/prompt/modules/course_assistant/*.md`
  - `tests/agents/course_assistant/test_request_config.py`
  - `tests/core/test_capabilities_runtime.py`

- [ ] **Step 1: Run focused request-config and runtime tests**

Run: `pytest tests/agents/course_assistant/test_request_config.py tests/core/test_capabilities_runtime.py -k "course_assistant" -v`

Expected: PASS for all `course_assistant` tests.

- [ ] **Step 2: Run a broader regression slice around capability runtime**

Run: `pytest tests/core/test_capabilities_runtime.py -v`

Expected: PASS for existing built-in capability runtime tests and new `course_assistant` tests.

- [ ] **Step 3: Inspect git diff for accidental scope creep**

Run: `git diff --stat HEAD~4..HEAD`

Expected: only capability, prompt, request contract, registry, and test files changed.

- [ ] **Step 4: Create the final implementation commit**

```bash
git add deeptutor/capabilities/course_assistant.py deeptutor/capabilities/request_contracts.py deeptutor/runtime/bootstrap/builtin_capabilities.py deeptutor/services/prompt/modules/course_assistant/*.md tests/agents/course_assistant/test_request_config.py tests/core/test_capabilities_runtime.py
git commit -m "feat: add course assistant capability"
```

- [ ] **Step 5: Record manual smoke-test commands for the human reviewer**

```bash
deeptutor run course_assistant "What is overfitting?" --kb "Trí tuệ nhân tạo" --config mode=qa
deeptutor run course_assistant "Generate 3 questions about machine learning basics" --kb "Trí tuệ nhân tạo" --config mode=exam --config num_questions=3
deeptutor run course_assistant "Create a revision plan for the final exam" --kb "Trí tuệ nhân tạo" --config mode=study_plan
deeptutor run course_assistant "Summarize deep learning" --kb "Trí tuệ nhân tạo" --config mode=summary --config chapter="Mô hình học sâu và mạng nơ-ron"
```

Expected: each command emits the new four-stage stream shape and returns a normalized result payload.
