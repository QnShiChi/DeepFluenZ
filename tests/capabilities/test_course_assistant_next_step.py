from deeptutor.capabilities.course_assistant import CourseAssistantCapability


def test_build_next_step_hint_returns_structured_prompt_block() -> None:
    hint = CourseAssistantCapability()._build_next_step_hint(
        {
            "next_step_decision": {
                "action": "stay_and_explain",
                "target_node_id": "topic_search",
                "reason_tags": ["mastery_uncertain"],
                "explanation_summary": "Can giai thich lai ngan gon.",
            }
        }
    )

    assert "stay_and_explain" in hint
    assert "topic_search" in hint
    assert "Can giai thich lai ngan gon." in hint
