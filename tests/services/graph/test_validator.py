import pytest

from deeptutor.services.graph.validator import validate_course_knowledge_graph


def test_validate_course_knowledge_graph_rejects_orphan_edges() -> None:
    payload = {
        "course_id": "intro-ai",
        "title": "Intro to AI",
        "source_type": "manual_json",
        "nodes": [
            {
                "node_id": "topic_intro",
                "title": "Introduction to AI",
                "node_type": "topic",
                "description": "Overview",
                "difficulty": "easy",
                "learning_outcomes": [],
                "examples": [],
                "related_questions": [],
                "resources": [],
                "source_refs": [],
            }
        ],
        "edges": [
            {
                "edge_id": "edge_1",
                "source": "topic_intro",
                "target": "missing_node",
                "relation_type": "prerequisite",
                "confidence": 1.0,
                "rationale": "Week order",
                "source_refs": [],
            }
        ],
        "audit": {
            "backbone_node_ids": ["topic_intro"],
            "enriched_node_ids": [],
            "backbone_edge_ids": ["edge_1"],
            "enriched_edge_ids": [],
            "warnings": [],
        },
    }

    with pytest.raises(ValueError, match="missing_node"):
        validate_course_knowledge_graph(payload)
