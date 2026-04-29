from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.remediation import (
    clear_completed_remediation,
    create_or_update_remediation_state,
    mark_remediation_mini_quiz_passed,
    resolve_remediation_target,
)


def build_remediation_graph() -> CourseKnowledgeGraph:
    return CourseKnowledgeGraph.model_validate(
        {
            "course_id": "intro-ai",
            "title": "Intro AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "topic_intro", "title": "Intro", "node_type": "topic"},
                {"node_id": "topic_search", "title": "Search", "node_type": "topic"},
                {"node_id": "topic_planning", "title": "Planning", "node_type": "topic"},
            ],
            "edges": [
                {
                    "edge_id": "edge_intro_search",
                    "source": "topic_intro",
                    "target": "topic_search",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                    "rationale": "",
                    "source_refs": [],
                },
                {
                    "edge_id": "edge_search_planning",
                    "source": "topic_search",
                    "target": "topic_planning",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                    "rationale": "",
                    "source_refs": [],
                },
            ],
            "audit": {
                "backbone_node_ids": ["topic_intro", "topic_search", "topic_planning"],
                "enriched_node_ids": [],
                "backbone_edge_ids": ["edge_intro_search", "edge_search_planning"],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )


def test_resolve_remediation_target_prefers_current_node_without_prerequisite_gap() -> None:
    target = resolve_remediation_target(
        graph=build_remediation_graph(),
        source_node_id="topic_search",
        weak_concepts=["state_space"],
        mastered_nodes=["topic_intro"],
        prerequisite_weakness=False,
    )

    assert target["target_node_id"] == "topic_search"


def test_resolve_remediation_target_drops_to_prerequisite_when_needed() -> None:
    target = resolve_remediation_target(
        graph=build_remediation_graph(),
        source_node_id="topic_planning",
        weak_concepts=["state_space"],
        mastered_nodes=[],
        prerequisite_weakness=True,
    )

    assert target["target_node_id"] == "topic_search"


def test_create_or_update_remediation_state_sets_recommended_status() -> None:
    state = create_or_update_remediation_state(
        current_state={},
        source_node_id="topic_search",
        target_node_id="topic_intro",
        weak_concepts=["state_space"],
        failure_severity="moderate",
        score_ratio=0.4,
    )

    assert state["active_remediation"]["status"] == "recommended"
    assert state["active_remediation"]["attempt_count"] == 0


def test_remediation_state_clears_only_after_mini_quiz_and_main_quiz_pass() -> None:
    state = create_or_update_remediation_state(
        current_state={},
        source_node_id="topic_search",
        target_node_id="topic_intro",
        weak_concepts=["state_space"],
        failure_severity="moderate",
        score_ratio=0.4,
    )
    state = mark_remediation_mini_quiz_passed(state, score_ratio=1.0)
    assert state["active_remediation"]["status"] == "passed_mini_quiz"

    uncleared = clear_completed_remediation(
        state,
        passed_node_id="topic_intro",
    )
    assert uncleared["active_remediation"]["status"] == "passed_mini_quiz"

    cleared = clear_completed_remediation(
        state,
        passed_node_id="topic_search",
    )
    assert cleared["active_remediation"] is None
