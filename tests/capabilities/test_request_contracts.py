from deeptutor.capabilities.request_contracts import validate_capability_config


def test_validate_capability_config_allows_deep_question_graph_context_as_runtime_only() -> None:
    config = validate_capability_config(
        "deep_question",
        {
            "mode": "custom",
            "num_questions": 3,
            "graph_context": {
                "course_id": "intro-ai",
                "node_id": "topic_search",
            },
        },
    )

    assert config == {
        "mode": "custom",
        "topic": "",
        "num_questions": 3,
        "difficulty": "",
        "question_type": "",
        "preference": "",
        "paper_path": "",
        "max_questions": 10,
    }


def test_validate_capability_config_allows_deep_question_remediation_graph_context() -> None:
    config = validate_capability_config(
        "deep_question",
        {
            "mode": "custom",
            "num_questions": 2,
            "graph_context": {
                "course_id": "intro-ai",
                "node_id": "topic_search",
                "quiz_kind": "remediation_quiz",
                "target_node_id": "topic_intro",
                "weak_concepts": ["state_space"],
            },
        },
    )

    assert config == {
        "mode": "custom",
        "topic": "",
        "num_questions": 2,
        "difficulty": "",
        "question_type": "",
        "preference": "",
        "paper_path": "",
        "max_questions": 10,
    }


def test_validate_capability_config_strips_course_assistant_next_step_payload() -> None:
    config = validate_capability_config(
        "course_assistant",
        {
            "mode": "qa",
            "_persist_user_message": True,
            "next_step_decision": {"action": "stay_and_explain"},
        },
    )

    assert config["mode"] == "qa"
    assert "next_step_decision" not in config
