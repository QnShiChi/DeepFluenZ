from __future__ import annotations

from deeptutor.services.graph.models import CourseKnowledgeGraph


def validate_course_knowledge_graph(payload: dict) -> CourseKnowledgeGraph:
    graph = CourseKnowledgeGraph.model_validate(payload)
    node_ids = {node.node_id for node in graph.nodes}

    for edge in graph.edges:
        if edge.source not in node_ids:
            raise ValueError(f"Unknown edge source: {edge.source}")
        if edge.target not in node_ids:
            raise ValueError(f"Unknown edge target: {edge.target}")

    seen_edges: set[str] = set()
    sanitized_edges = []
    for edge in graph.edges:
        if edge.edge_id in seen_edges:
            graph.audit.warnings.append(f"Duplicate edge dropped: {edge.edge_id}")
            continue
        seen_edges.add(edge.edge_id)
        sanitized_edges.append(edge)

    graph.edges = sanitized_edges
    if graph.import_report is not None:
        graph.import_report.warning_count = len(graph.audit.warnings)
        graph.import_report.edge_count = len(graph.edges)

    return graph
