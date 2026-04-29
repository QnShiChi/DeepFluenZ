from deeptutor.services.graph.models import ActiveGraphRemediation
from deeptutor.services.graph.quiz_policy import (
    determine_failure_severity,
    determine_graph_quiz_count,
    determine_graph_quiz_pass_threshold,
    determine_remediation_quiz_count,
    normalize_graph_quiz_kinds,
)


def test_graph_quiz_count_uses_difficulty_and_failure_severity() -> None:
    assert determine_graph_quiz_count("easy", None) == 3
    assert determine_graph_quiz_count("medium", "moderate") == 6
    assert determine_graph_quiz_count("hard", "severe") == 9


def test_remediation_quiz_count_is_shorter_and_grows_by_attempt() -> None:
    assert determine_remediation_quiz_count("easy", attempt_count=0) == 2
    assert determine_remediation_quiz_count("medium", attempt_count=1) == 4
    assert determine_remediation_quiz_count("hard", attempt_count=2) == 5


def test_graph_quiz_pass_threshold_is_count_based() -> None:
    assert determine_graph_quiz_pass_threshold(3) == 2
    assert determine_graph_quiz_pass_threshold(5) == 4
    assert determine_graph_quiz_pass_threshold(7) == 5


def test_failure_severity_uses_score_and_prerequisite_weakness() -> None:
    assert determine_failure_severity(
        score_ratio=0.62,
        weak_concepts=["search_state_space"],
        prerequisite_weakness=False,
    ) == "moderate"
    assert determine_failure_severity(
        score_ratio=0.2,
        weak_concepts=["search_state_space"],
        prerequisite_weakness=True,
    ) == "severe"


def test_normalize_graph_quiz_kinds_forces_multiple_choice() -> None:
    normalized = normalize_graph_quiz_kinds(["coding", "multiple_choice", "written"])
    assert normalized == ["multiple_choice"]


def test_active_graph_remediation_defaults_cache_fields() -> None:
    state = ActiveGraphRemediation.model_validate(
        {
            "source_node_id": "topic_search",
            "target_node_id": "topic_intro",
            "weak_concepts": ["state_space"],
            "failure_severity": "moderate",
            "status": "recommended",
        }
    )

    assert state.attempt_count == 0
    assert state.last_node_quiz_score is None
    assert state.last_remediation_quiz_score is None
