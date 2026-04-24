from pydantic import ValidationError

from deeptutor.services.graph.models import CourseKnowledgeGraph


def test_course_knowledge_graph_rejects_unknown_relation_type() -> None:
    payload = {
        "course_id": "intro-ai",
        "title": "Intro to AI",
        "source_type": "syllabus_pdf",
        "source_summary": "Week-by-week syllabus",
        "import_version": "v1",
        "nodes": [
            {
                "node_id": "topic_intro",
                "title": "Introduction to AI",
                "node_type": "topic",
                "description": "Overview of the course scope.",
                "difficulty": "easy",
                "learning_outcomes": ["Describe the scope of AI"],
                "examples": ["Classifying images"],
                "related_questions": ["What is AI?"],
                "resources": [],
                "source_refs": [{"section_title": "Week 1", "snippet": "Introduction to AI"}],
            }
        ],
        "edges": [
            {
                "edge_id": "edge_1",
                "source": "topic_intro",
                "target": "topic_ethics",
                "relation_type": "depends_on",
                "confidence": 0.9,
                "rationale": "Suggested by the model",
                "source_refs": [],
            }
        ],
        "audit": {
            "backbone_node_ids": ["topic_intro"],
            "enriched_node_ids": [],
            "backbone_edge_ids": [],
            "enriched_edge_ids": ["edge_1"],
            "warnings": [],
        },
    }

    try:
        CourseKnowledgeGraph.model_validate(payload)
    except ValidationError as exc:
        assert "depends_on" in str(exc)
    else:
        raise AssertionError("Expected validation error for unsupported relation_type")
