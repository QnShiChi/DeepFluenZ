from __future__ import annotations

from collections import defaultdict

from deeptutor.services.graph.models import (
    CourseKnowledgeGraph,
    GraphQaGateStatus,
    GraphQaHealthSummary,
    GraphQaIssue,
    GraphQaReport,
    GraphQaSuggestedFix,
)


def analyze_course_graph(graph: CourseKnowledgeGraph) -> GraphQaReport:
    issues: list[GraphQaIssue] = []
    fixes: list[GraphQaSuggestedFix] = []

    prerequisite_edges = [edge for edge in graph.edges if edge.relation_type == "prerequisite"]
    outgoing: dict[str, set[str]] = defaultdict(set)
    for edge in prerequisite_edges:
        outgoing[edge.source].add(edge.target)

    node_ids = {node.node_id for node in graph.nodes}
    if _contains_cycle(outgoing, node_ids):
        issues.append(
            GraphQaIssue(
                issue_id="issue_cycle",
                severity="critical",
                kind="prerequisite_cycle",
                message="The prerequisite graph contains a cycle.",
                affected_node_ids=sorted(node_ids),
                why_it_matters="Students cannot progress through a cyclic prerequisite chain.",
            )
        )

    backbone_edge_ids = set(graph.audit.backbone_edge_ids)
    for edge in graph.edges:
        if edge.relation_type != "part_of":
            continue
        if edge.edge_id in backbone_edge_ids:
            issue_id = f"issue_{edge.edge_id}"
            issues.append(
                GraphQaIssue(
                    issue_id=issue_id,
                    severity="high",
                    kind="suspect_part_of_should_be_prerequisite",
                    message=f"Edge {edge.edge_id} appears to encode a dependency.",
                    affected_node_ids=[edge.source, edge.target],
                    affected_edge_ids=[edge.edge_id],
                    why_it_matters="Adaptive progression may unlock the downstream topic too early.",
                )
            )
            fixes.append(
                GraphQaSuggestedFix(
                    fix_id=f"fix_{edge.edge_id}",
                    issue_id=issue_id,
                    confidence=0.9,
                    change_type="change_relation_type",
                    preview={
                        "edge_id": edge.edge_id,
                        "before": {"relation_type": edge.relation_type},
                        "after": {"relation_type": "prerequisite"},
                    },
                    safe_for_bulk_apply=True,
                )
            )

    critical_count = sum(1 for issue in issues if issue.severity == "critical")
    high_count = sum(1 for issue in issues if issue.severity == "high")
    medium_count = sum(1 for issue in issues if issue.severity == "medium")
    low_count = sum(1 for issue in issues if issue.severity == "low")
    status = (
        "adaptive_blocked"
        if critical_count
        else "adaptive_limited"
        if issues
        else "adaptive_ready"
    )

    return GraphQaReport(
        course_id=graph.course_id,
        health_summary=GraphQaHealthSummary(
            score=max(
                0,
                100
                - critical_count * 40
                - high_count * 15
                - medium_count * 8
                - low_count * 3,
            ),
            adaptive_ready=status == "adaptive_ready",
            critical_count=critical_count,
            high_count=high_count,
            medium_count=medium_count,
            low_count=low_count,
        ),
        issues=issues,
        suggested_fixes=fixes,
        gate_status=GraphQaGateStatus(
            status=status,
            blocking_issue_ids=[
                issue.issue_id for issue in issues if issue.severity == "critical"
            ],
            student_visible_message=(
                "Adaptive guidance is blocked until prerequisite issues are resolved."
                if critical_count
                else ""
            ),
            instructor_message=(
                "Resolve critical graph issues to enable adaptive mode."
                if critical_count
                else ""
            ),
        ),
    )


def _contains_cycle(outgoing: dict[str, set[str]], node_ids: set[str]) -> bool:
    visited: set[str] = set()
    active: set[str] = set()

    def visit(node_id: str) -> bool:
        if node_id in active:
            return True
        if node_id in visited:
            return False

        visited.add(node_id)
        active.add(node_id)
        for neighbor in outgoing.get(node_id, set()):
            if visit(neighbor):
                return True
        active.remove(node_id)
        return False

    return any(visit(node_id) for node_id in node_ids)
