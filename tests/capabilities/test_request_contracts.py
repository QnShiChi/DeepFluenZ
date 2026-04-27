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
