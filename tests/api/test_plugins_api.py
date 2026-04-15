from __future__ import annotations

import pytest

from deeptutor.api.routers.plugins_api import (
    CapabilityExecuteRequest,
    _execute_capability_stream,
)
from deeptutor.core.stream import StreamEvent, StreamEventType


@pytest.mark.asyncio
async def test_execute_capability_stream_treats_error_events_as_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeOrchestrator:
        def list_capabilities(self) -> list[str]:
            return ["course_assistant"]

        async def handle(self, _context):
            yield StreamEvent(type=StreamEventType.SESSION, source="orchestrator")
            yield StreamEvent(
                type=StreamEventType.ERROR,
                source="course_assistant",
                stage="result",
                content="LLM returned invalid JSON.",
            )
            yield StreamEvent(type=StreamEventType.DONE, source="course_assistant")

    monkeypatch.setattr(
        "deeptutor.runtime.orchestrator.ChatOrchestrator",
        FakeOrchestrator,
    )

    body = CapabilityExecuteRequest(
        content="Create a study plan.",
        tools=["rag"],
        knowledge_bases=["ai-course"],
        language="en",
        config={"mode": "study_plan"},
    )

    events = [chunk async for chunk in _execute_capability_stream("course_assistant", body)]

    assert any("event: stream" in chunk and '"type": "error"' in chunk for chunk in events)
    assert any("event: error" in chunk and "LLM returned invalid JSON." in chunk for chunk in events)
    assert not any("event: result" in chunk and '"success": true' in chunk.lower() for chunk in events)
