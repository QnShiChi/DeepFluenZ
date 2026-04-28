from deeptutor.services.graph.models import GraphQaIssue, GraphQaReport, GraphQaSuggestedFix


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
