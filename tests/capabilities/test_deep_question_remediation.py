from __future__ import annotations

import asyncio
import sys
import types
from types import SimpleNamespace
from typing import Any

import pytest

from deeptutor.capabilities.deep_question import DeepQuestionCapability
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream import StreamEvent, StreamEventType
from deeptutor.core.stream_bus import StreamBus


def _install_module(monkeypatch: pytest.MonkeyPatch, fullname: str, **attrs: Any) -> types.ModuleType:
    __import__("src")
    parts = fullname.split(".")
    for idx in range(1, len(parts)):
        pkg_name = ".".join(parts[:idx])
        if pkg_name not in sys.modules:
            pkg = types.ModuleType(pkg_name)
            pkg.__path__ = []  # type: ignore[attr-defined]
            monkeypatch.setitem(sys.modules, pkg_name, pkg)
            if idx > 1:
                parent = sys.modules[".".join(parts[: idx - 1])]
                setattr(parent, parts[idx - 1], pkg)

    module = types.ModuleType(fullname)
    for key, value in attrs.items():
        setattr(module, key, value)
    monkeypatch.setitem(sys.modules, fullname, module)
    if len(parts) > 1:
        parent = sys.modules[".".join(parts[:-1])]
        setattr(parent, parts[-1], module)
    return module


async def _collect_events(run_coro) -> list[StreamEvent]:
    bus = StreamBus()
    events: list[StreamEvent] = []

    async def _consume() -> None:
      async for event in bus.subscribe():
        events.append(event)

    consumer = asyncio.create_task(_consume())
    await asyncio.sleep(0)
    await run_coro(bus)
    await asyncio.sleep(0)
    await bus.close()
    await consumer
    return events


def test_remediation_request_generates_multiple_choice_quiz_artifact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    class FakeCoordinator:
        def __init__(self, **kwargs: Any) -> None:
            captured["init"] = kwargs
            self._callback = None

        def set_ws_callback(self, callback) -> None:
            self._callback = callback

        async def generate_from_topic(self, **kwargs: Any) -> dict[str, Any]:
            captured["topic_call"] = kwargs
            await self._callback({"type": "idea_round", "message": "ideas"})
            return {
                "results": [
                    {
                        "qa_pair": {
                            "question_id": "q_1",
                            "question": "What is state space?",
                            "question_type": "written",
                            "options": {"A": "States", "B": "Actions", "C": "Rewards", "D": "Goals"},
                            "correct_answer": "A",
                            "explanation": "It is the set of all possible states.",
                        }
                    },
                    {
                        "qa_pair": {
                            "question_id": "q_2",
                            "question": "What is a search tree?",
                            "question_type": "coding",
                            "options": {"A": "Tree", "B": "Graph", "C": "List", "D": "Queue"},
                            "correct_answer": "A",
                            "explanation": "It expands states as nodes.",
                        }
                    },
                    {
                        "qa_pair": {
                            "question_id": "q_3",
                            "question": "Extra question",
                            "question_type": "choice",
                            "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
                            "correct_answer": "A",
                            "explanation": "Extra",
                        }
                    },
                ]
            }

    _install_module(
        monkeypatch,
        "deeptutor.agents.question.coordinator",
        AgentCoordinator=FakeCoordinator,
    )
    _install_module(
        monkeypatch,
        "deeptutor.services.llm.config",
        get_llm_config=lambda: SimpleNamespace(api_key="k", base_url="u", api_version="v1"),
    )

    async def _run() -> None:
        context = UnifiedContext(
            user_message="review weak concepts",
            config_overrides={
                "mode": "custom",
                "topic": "review weak concepts",
                "graph_context": {
                    "course_id": "intro-ai",
                    "node_id": "topic_search",
                    "target_node_id": "topic_intro",
                    "weak_concepts": ["state_space"],
                    "quiz_kind": "remediation_quiz",
                    "requested_question_count": 2,
                },
            },
            language="en",
        )
        capability = DeepQuestionCapability()
        events = await _collect_events(lambda bus: capability.run(context, bus))

        assert captured["topic_call"]["num_questions"] == 2
        assert captured["topic_call"]["question_type"] == "choice"
        result_event = next(event for event in events if event.type == StreamEventType.RESULT)
        summary = result_event.metadata["summary"]
        assert len(summary["results"]) == 2
        assert all(item["qa_pair"]["question_type"] == "choice" for item in summary["results"])
        assert result_event.metadata["graph_context"]["quiz_kind"] == "remediation_quiz"

    asyncio.run(_run())


def test_node_quiz_request_generates_multiple_choice_quiz_artifact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    class FakeCoordinator:
        def __init__(self, **kwargs: Any) -> None:
            captured["init"] = kwargs
            self._callback = None

        def set_ws_callback(self, callback) -> None:
            self._callback = callback

        async def generate_from_topic(self, **kwargs: Any) -> dict[str, Any]:
            captured["topic_call"] = kwargs
            await self._callback({"type": "idea_round", "message": "ideas"})
            return {
                "results": [
                    {
                        "qa_pair": {
                            "question_id": "q_1",
                            "question": "What is encapsulation?",
                            "question_type": "written",
                            "options": {"A": "A", "B": "B", "C": "C", "D": "D"},
                            "correct_answer": "A",
                            "explanation": "Encapsulation groups data and behavior.",
                        }
                    }
                ]
            }

    _install_module(
        monkeypatch,
        "deeptutor.agents.question.coordinator",
        AgentCoordinator=FakeCoordinator,
    )
    _install_module(
        monkeypatch,
        "deeptutor.services.llm.config",
        get_llm_config=lambda: SimpleNamespace(api_key="k", base_url="u", api_version="v1"),
    )

    async def _run() -> None:
        context = UnifiedContext(
            user_message="oop fundamentals",
            config_overrides={
                "mode": "custom",
                "topic": "oop fundamentals",
                "graph_context": {
                    "course_id": "intro-oop",
                    "node_id": "topic_oop_intro",
                    "quiz_kind": "node_quiz",
                    "node_difficulty": "medium",
                    "requested_question_count": 5,
                },
            },
            language="en",
        )
        capability = DeepQuestionCapability()
        events = await _collect_events(lambda bus: capability.run(context, bus))

        assert captured["topic_call"]["num_questions"] == 5
        assert captured["topic_call"]["question_type"] == "choice"
        assert "multiple_choice only" in captured["topic_call"]["preference"]
        result_event = next(event for event in events if event.type == StreamEventType.RESULT)
        assert result_event.metadata["graph_context"]["quiz_kind"] == "node_quiz"

    asyncio.run(_run())
