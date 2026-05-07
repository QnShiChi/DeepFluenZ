from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.pipeline import merge_course_graph_layers


def test_course_knowledge_graph_accepts_hierarchical_nodes_and_contains_edges() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "oop-java",
            "title": "OOP Java",
            "source_type": "syllabus_text",
            "nodes": [
                {
                    "node_id": "lesson-3",
                    "title": "Bai 3: Gioi thieu ve Java",
                    "description": "Tong quan nen tang Java.",
                    "node_type": "lesson",
                    "hierarchy_level": 0,
                    "source_label": "Bai 3",
                    "source_path": ["Bai 3"],
                    "ordinal": "3",
                },
                {
                    "node_id": "subtopic-3-2",
                    "title": "3.2 Cau truc chuong trinh Java",
                    "description": "Cau truc class va ham main.",
                    "node_type": "subtopic",
                    "hierarchy_level": 1,
                    "parent_node_id": "lesson-3",
                    "source_label": "3.2",
                    "source_path": ["Bai 3", "3.2"],
                    "ordinal": "3.2",
                },
            ],
            "edges": [
                {
                    "edge_id": "contains-lesson-3-subtopic-3-2",
                    "source": "lesson-3",
                    "target": "subtopic-3-2",
                    "relation_type": "contains",
                    "confidence": 1.0,
                }
            ],
            "audit": {
                "backbone_node_ids": ["lesson-3"],
                "enriched_node_ids": ["subtopic-3-2"],
                "backbone_edge_ids": [],
                "enriched_edge_ids": ["contains-lesson-3-subtopic-3-2"],
                "warnings": [],
            },
        }
    )

    assert graph.nodes[0].node_type == "lesson"
    assert graph.nodes[1].parent_node_id == "lesson-3"
    assert graph.edges[0].relation_type == "contains"


def test_merge_course_graph_layers_preserves_numbered_lesson_hierarchy() -> None:
    backbone = {
        "course_id": "oop-java",
        "title": "Lap trinh huong doi tuong",
        "source_type": "syllabus_text",
        "nodes": [
            {
                "node_id": "lesson-1",
                "title": "Bai 1: Gioi thieu ve OOP",
                "description": "",
                "node_type": "lesson",
                "ordinal": "1",
            },
            {
                "node_id": "subtopic-1-1",
                "title": "1.1 Mot so khai niem",
                "description": "",
                "node_type": "subtopic",
                "parent_node_id": "lesson-1",
                "ordinal": "1.1",
            },
            {
                "node_id": "subtopic-1-2",
                "title": "1.2 Ngon ngu ho tro lap trinh huong doi tuong",
                "description": "",
                "node_type": "subtopic",
                "parent_node_id": "lesson-1",
                "ordinal": "1.2",
            },
        ],
        "edges": [
            {
                "edge_id": "contains-1-1",
                "source": "lesson-1",
                "target": "subtopic-1-1",
                "relation_type": "contains",
            },
            {
                "edge_id": "contains-1-2",
                "source": "lesson-1",
                "target": "subtopic-1-2",
                "relation_type": "contains",
            },
        ],
        "audit": {
            "backbone_node_ids": ["lesson-1"],
            "enriched_node_ids": [],
            "backbone_edge_ids": [],
            "enriched_edge_ids": [],
            "warnings": [],
        },
    }
    enriched = {"nodes": [], "edges": []}

    graph = merge_course_graph_layers(backbone, enriched)

    children = sorted(node.title for node in graph.nodes if node.parent_node_id == "lesson-1")
    assert children == [
        "1.1 Mot so khai niem",
        "1.2 Ngon ngu ho tro lap trinh huong doi tuong",
    ]
