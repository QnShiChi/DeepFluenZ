from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.qa_authoring import apply_graph_fix
from deeptutor.services.graph.recommendation import recommend_next_graph_node


def test_recommendation_ignores_contains_edges_as_prerequisites() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "oop-java",
            "title": "OOP Java",
            "source_type": "syllabus_text",
            "nodes": [
                {
                    "node_id": "lesson-3",
                    "title": "Bai 3",
                    "description": "",
                    "node_type": "lesson",
                },
                {
                    "node_id": "subtopic-3-1",
                    "title": "3.1",
                    "description": "",
                    "node_type": "subtopic",
                    "parent_node_id": "lesson-3",
                },
                {
                    "node_id": "subtopic-4-1",
                    "title": "4.1",
                    "description": "",
                    "node_type": "subtopic",
                },
            ],
            "edges": [
                {
                    "edge_id": "contains-3-1",
                    "source": "lesson-3",
                    "target": "subtopic-3-1",
                    "relation_type": "contains",
                    "confidence": 1.0,
                },
                {
                    "edge_id": "prereq-3-4",
                    "source": "subtopic-3-1",
                    "target": "subtopic-4-1",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                },
            ],
            "audit": {
                "backbone_node_ids": [],
                "enriched_node_ids": [],
                "backbone_edge_ids": [],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )
    state = {
        "mastered_nodes": ["lesson-3", "subtopic-3-1"],
        "weak_node_ids": [],
        "active_remediation": None,
    }

    recommendation = recommend_next_graph_node(graph=graph, student_state=state)

    assert recommendation.recommended_node_id == "subtopic-4-1"


def test_apply_graph_fix_preserves_hierarchy_fields_during_round_trip() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "oop-java",
            "title": "OOP Java",
            "source_type": "syllabus_text",
            "nodes": [
                {
                    "node_id": "lesson-3",
                    "title": "Bai 3",
                    "description": "",
                    "node_type": "lesson",
                    "hierarchy_level": 0,
                    "source_label": "Bai 3",
                    "source_path": ["Bai 3"],
                },
                {
                    "node_id": "subtopic-3-1",
                    "title": "3.1",
                    "description": "",
                    "node_type": "subtopic",
                    "hierarchy_level": 1,
                    "parent_node_id": "lesson-3",
                    "source_label": "3.1",
                    "source_path": ["Bai 3", "3.1"],
                },
            ],
            "edges": [
                {
                    "edge_id": "contains-3-1",
                    "source": "lesson-3",
                    "target": "subtopic-3-1",
                    "relation_type": "contains",
                    "confidence": 1.0,
                }
            ],
            "audit": {
                "backbone_node_ids": [],
                "enriched_node_ids": [],
                "backbone_edge_ids": [],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )

    updated = apply_graph_fix(
        graph,
        {
            "change_type": "change_relation_type",
            "preview": {
                "edge_id": "contains-3-1",
                "after": {"relation_type": "related_to"},
            },
        },
    )

    child = next(node for node in updated.nodes if node.node_id == "subtopic-3-1")
    assert child.parent_node_id == "lesson-3"
    assert child.source_path == ["Bai 3", "3.1"]
