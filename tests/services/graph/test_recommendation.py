from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation
from deeptutor.services.graph.recommendation import recommend_next_graph_node


def test_graph_recommendation_defaults_backup_nodes_and_reason_codes() -> None:
    recommendation = GraphRecommendation.model_validate(
        {
            "recommended_node_id": "topic_search",
            "mode": "advance",
            "score": 0.78,
        }
    )

    assert recommendation.recommended_node_id == "topic_search"
    assert recommendation.mode == "advance"
    assert recommendation.reason_codes == []
    assert recommendation.backup_node_ids == []


def build_graph() -> CourseKnowledgeGraph:
    return CourseKnowledgeGraph.model_validate(
        {
            "course_id": "intro-ai",
            "title": "Intro to AI",
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


def test_recommend_next_graph_node_prefers_first_reachable_unmastered_topic() -> None:
    recommendation = recommend_next_graph_node(
        graph=build_graph(),
        student_state={
            "current_node_id": "topic_intro",
            "mastered_nodes": ["topic_intro"],
            "explored_nodes": [],
        },
    )

    assert recommendation.recommended_node_id == "topic_search"
    assert recommendation.mode == "advance"
    assert "prerequisites_ready" in recommendation.reason_codes


def test_recommend_next_graph_node_switches_to_review_when_only_explored_nodes_remain() -> None:
    recommendation = recommend_next_graph_node(
        graph=build_graph(),
        student_state={
            "current_node_id": "topic_planning",
            "mastered_nodes": ["topic_intro", "topic_search"],
            "explored_nodes": ["topic_planning"],
        },
    )

    assert recommendation.recommended_node_id == "topic_planning"
    assert recommendation.mode == "review"
    assert "needs_review_before_advance" in recommendation.reason_codes
