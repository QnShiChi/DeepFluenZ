import pytest
from pydantic import ValidationError

from deeptutor.services.graph.models import (
    CourseKnowledgeGraph,
    GraphQaIssue,
    GraphQaReport,
    GraphQaSuggestedFix,
)
from deeptutor.services.graph.qa_authoring import apply_graph_fix
from deeptutor.services.graph.qa import analyze_course_graph


def test_graph_qa_report_defaults_nested_lists() -> None:
    report = GraphQaReport.model_validate(
        {
            "course_id": "intro-ai",
            "health_summary": {
                "score": 82,
                "adaptive_ready": False,
                "critical_count": 0,
                "high_count": 1,
                "medium_count": 0,
                "low_count": 0,
            },
            "gate_status": {
                "status": "adaptive_limited",
                "blocking_issue_ids": [],
                "student_visible_message": "Adaptive guidance is available with limitations.",
                "instructor_message": "Resolve high-priority graph issues to improve adaptive reliability.",
            },
        }
    )

    assert report.course_id == "intro-ai"
    assert report.issues == []
    assert report.suggested_fixes == []


def test_graph_qa_issue_and_fix_literals_validate() -> None:
    issue = GraphQaIssue.model_validate(
        {
            "issue_id": "issue_1",
            "severity": "high",
            "kind": "suspect_part_of_should_be_prerequisite",
            "message": "Edge edge_intro_search appears to encode a dependency.",
            "affected_node_ids": ["topic_intro", "topic_search"],
            "affected_edge_ids": ["edge_intro_search"],
            "why_it_matters": "Adaptive progression may unlock topic_search too early.",
        }
    )
    fix = GraphQaSuggestedFix.model_validate(
        {
            "fix_id": "fix_1",
            "issue_id": "issue_1",
            "confidence": 0.92,
            "change_type": "change_relation_type",
            "preview": {
                "edge_id": "edge_intro_search",
                "before": {"relation_type": "part_of"},
                "after": {"relation_type": "prerequisite"},
            },
            "safe_for_bulk_apply": True,
        }
    )

    assert issue.severity == "high"
    assert fix.change_type == "change_relation_type"


def test_graph_qa_rejects_invalid_literals() -> None:
    with pytest.raises(ValidationError):
        GraphQaIssue.model_validate(
            {
                "issue_id": "issue_2",
                "severity": "urgent",
                "kind": "orphan_node",
                "message": "Invalid severity should fail.",
            }
        )

    with pytest.raises(ValidationError):
        GraphQaSuggestedFix.model_validate(
            {
                "fix_id": "fix_2",
                "issue_id": "issue_2",
                "confidence": 0.5,
                "change_type": "relabel_edge",
            }
        )


def test_graph_qa_health_summary_rejects_negative_counts() -> None:
    with pytest.raises(ValidationError):
        GraphQaReport.model_validate(
            {
                "course_id": "intro-ai",
                "health_summary": {
                    "score": 82,
                    "adaptive_ready": False,
                    "critical_count": -1,
                    "high_count": 1,
                    "medium_count": 0,
                    "low_count": 0,
                },
                "gate_status": {
                    "status": "adaptive_limited",
                    "blocking_issue_ids": [],
                    "student_visible_message": "Adaptive guidance is available with limitations.",
                    "instructor_message": "Resolve high-priority graph issues to improve adaptive reliability.",
                },
            }
        )


def build_graph_with_suspect_part_of() -> CourseKnowledgeGraph:
    return CourseKnowledgeGraph.model_validate(
        {
            "course_id": "intro-ai",
            "title": "Intro to AI",
            "source_type": "manual_json",
            "nodes": [
                {
                    "node_id": "topic_intro",
                    "title": "Introduction to AI",
                    "node_type": "topic",
                },
                {
                    "node_id": "topic_search",
                    "title": "AI Search Techniques",
                    "node_type": "topic",
                },
            ],
            "edges": [
                {
                    "edge_id": "edge_intro_search",
                    "source": "topic_intro",
                    "target": "topic_search",
                    "relation_type": "part_of",
                    "confidence": 1.0,
                }
            ],
            "audit": {
                "backbone_node_ids": ["topic_intro", "topic_search"],
                "enriched_node_ids": [],
                "backbone_edge_ids": ["edge_intro_search"],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )


def build_clean_graph() -> CourseKnowledgeGraph:
    return CourseKnowledgeGraph.model_validate(
        {
            "course_id": "clean-ai",
            "title": "Clean AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "topic_intro", "title": "Introduction to AI", "node_type": "topic"},
                {"node_id": "topic_search", "title": "AI Search Techniques", "node_type": "topic"},
            ],
            "edges": [
                {
                    "edge_id": "edge_intro_search",
                    "source": "topic_intro",
                    "target": "topic_search",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                }
            ],
            "audit": {
                "backbone_node_ids": ["topic_intro", "topic_search"],
                "enriched_node_ids": [],
                "backbone_edge_ids": ["edge_intro_search"],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )


def test_analyze_course_graph_flags_suspect_part_of_edge() -> None:
    report = analyze_course_graph(build_graph_with_suspect_part_of())

    assert report.health_summary.high_count == 1
    assert report.health_summary.adaptive_ready is False
    assert report.gate_status.status == "adaptive_limited"
    assert report.issues[0].kind == "suspect_part_of_should_be_prerequisite"
    assert report.suggested_fixes[0].change_type == "change_relation_type"


def test_analyze_course_graph_blocks_cycles() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "cycle-ai",
            "title": "Cycle AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "a", "title": "A", "node_type": "topic"},
                {"node_id": "b", "title": "B", "node_type": "topic"},
            ],
            "edges": [
                {
                    "edge_id": "edge_ab",
                    "source": "a",
                    "target": "b",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                },
                {
                    "edge_id": "edge_ba",
                    "source": "b",
                    "target": "a",
                    "relation_type": "prerequisite",
                    "confidence": 1.0,
                },
            ],
            "audit": {
                "backbone_node_ids": ["a", "b"],
                "enriched_node_ids": [],
                "backbone_edge_ids": ["edge_ab", "edge_ba"],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )

    report = analyze_course_graph(graph)

    assert report.health_summary.critical_count == 1
    assert report.gate_status.status == "adaptive_blocked"
    assert report.issues[0].kind == "prerequisite_cycle"


def test_analyze_course_graph_returns_ready_for_clean_graph() -> None:
    report = analyze_course_graph(build_clean_graph())

    assert report.health_summary.adaptive_ready is True
    assert report.gate_status.status == "adaptive_ready"
    assert report.issues == []
    assert report.suggested_fixes == []


def test_apply_graph_fix_changes_relation_type() -> None:
    graph = build_graph_with_suspect_part_of()
    updated = apply_graph_fix(
        graph,
        {
            "change_type": "change_relation_type",
            "preview": {
                "edge_id": "edge_intro_search",
                "after": {"relation_type": "prerequisite"},
            },
        },
    )

    edge = next(edge for edge in updated.edges if edge.edge_id == "edge_intro_search")
    assert edge.relation_type == "prerequisite"


def test_analyze_course_graph_ignores_part_of_edge_not_in_backbone_edge_ids() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "intro-ai",
            "title": "Intro to AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "topic_intro", "title": "Introduction to AI", "node_type": "topic"},
                {"node_id": "topic_search", "title": "AI Search Techniques", "node_type": "topic"},
            ],
            "edges": [
                {
                    "edge_id": "edge_intro_search",
                    "source": "topic_intro",
                    "target": "topic_search",
                    "relation_type": "part_of",
                    "confidence": 1.0,
                }
            ],
            "audit": {
                "backbone_node_ids": ["topic_intro", "topic_search"],
                "enriched_node_ids": [],
                "backbone_edge_ids": [],
                "enriched_edge_ids": ["edge_intro_search"],
                "warnings": [],
            },
        }
    )

    report = analyze_course_graph(graph)

    assert report.health_summary.adaptive_ready is True
    assert report.gate_status.status == "adaptive_ready"
    assert report.issues == []
    assert report.suggested_fixes == []
