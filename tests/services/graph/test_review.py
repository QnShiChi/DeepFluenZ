from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.review import (
    build_default_review_state,
    rank_review_queue,
    record_review_signal,
)


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


def test_record_review_signal_marks_quiz_failure_as_due_soon() -> None:
    state = build_default_review_state()

    updated = record_review_signal(
        review_state=state,
        signal_type="quiz_failed",
        node_id="topic_search",
        occurred_at="2026-05-06T09:00:00Z",
        score_ratio=0.4,
    )

    node_state = updated["nodes"]["topic_search"]
    assert round(node_state["forgetting_risk"], 2) == 0.8
    assert node_state["review_mode"] == "focused_review"
    assert node_state["due_at"] == "2026-05-07T09:00:00Z"


def test_rank_review_queue_prefers_blocking_prerequisite_over_older_leaf() -> None:
    review_state = {
        "nodes": {
            "topic_intro": {
                "last_reviewed_at": "2026-05-01T09:00:00Z",
                "due_at": "2026-05-07T09:00:00Z",
                "forgetting_risk": 0.72,
                "retrievability": 0.44,
                "review_mode": "full_node_review",
            },
            "topic_planning": {
                "last_reviewed_at": "2026-04-29T09:00:00Z",
                "due_at": "2026-05-06T12:00:00Z",
                "forgetting_risk": 0.68,
                "retrievability": 0.40,
                "review_mode": "light_recall_check",
            },
        }
    }

    queue = rank_review_queue(
        graph=build_graph(),
        review_state=review_state,
        active_path_node_ids=["topic_search"],
        now="2026-05-06T12:30:00Z",
    )

    assert queue[0]["node_id"] == "topic_intro"
    assert queue[0]["reason_codes"] == ["needs_review_before_advance", "high_unlock_value"]
    assert queue[1]["node_id"] == "topic_planning"
