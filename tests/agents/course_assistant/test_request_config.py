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
