"""Course assistant capability."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from deeptutor.capabilities.request_contracts import (
    CourseAssistantRequestConfig,
    get_capability_request_schema,
    validate_course_assistant_request_config,
)
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.services.llm.config import get_llm_config
from deeptutor.services.llm.executors import sdk_complete
from deeptutor.runtime.registry.tool_registry import get_tool_registry


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
        try:
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
        except Exception as exc:
            await stream.error(str(exc), source=self.name, stage="result")

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
        if path.exists():
            return path.read_text(encoding="utf-8")

        if name == "qa_prompt.md":
            return (
                "You are a university course assistant.\n\n"
                "Knowledge base: {kb_name}\n\n"
                "Question:\n{user_message}\n\n"
                "Grounded context:\n{grounded_context}\n"
            )
        return "{user_message}\n\n{grounded_context}"

    def _render_prompt(self, name: str, **values: Any) -> str:
        template = self._load_prompt_template(name)
        return template.format(**values)

    def _parse_llm_json(self, raw: str) -> dict[str, Any]:
        text = str(raw or "").strip()
        if not text:
            raise ValueError("Model returned an empty response.")

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        fence_match = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
        if fence_match:
            return json.loads(fence_match.group(1))

        json_match = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))

        raise ValueError("Model did not return valid JSON.")

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
            system_prompt="Bạn là trợ giảng đại học. Trả lời bằng tiếng Việt.",
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
            system_prompt="Bạn là trợ giảng đại học. Tạo câu hỏi bằng tiếng Việt.",
            provider_name=llm_config.binding,
            model=llm_config.model,
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            api_version=llm_config.api_version,
        )
        parsed = self._parse_llm_json(raw)
        questions = list(parsed.get("questions", []))
        
        # Format response based on question type
        if config.question_type == "multiple_choice":
            # For multiple choice, include options and answer in the response
            response_parts = []
            for idx, item in enumerate(questions):
                # Format: Question with options, then Answer
                question_text = item['prompt']
                answer = item.get('answer_hint', 'N/A')
                response_parts.append(
                    f"{idx + 1}. {question_text}\nAnswer: {answer}"
                )
            response = "\n\n".join(response_parts)
        else:
            # For other types, use the original format
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
            system_prompt="Bạn là trợ giảng đại học. Tạo kế hoạch học tập bằng tiếng Việt.",
            provider_name=llm_config.binding,
            model=llm_config.model,
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            api_version=llm_config.api_version,
        )
        parsed = self._parse_llm_json(raw)
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
        query = (
            context.user_message
            or " ".join(part for part in [config.chapter, config.section] if part).strip()
        )
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
            system_prompt="Bạn là trợ giảng đại học. Tóm tắt bằng tiếng Việt.",
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
