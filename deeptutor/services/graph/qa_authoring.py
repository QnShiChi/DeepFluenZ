from __future__ import annotations

from deeptutor.services.graph.models import CourseKnowledgeGraph


def apply_graph_fix(
    graph: CourseKnowledgeGraph,
    fix: dict[str, object],
) -> CourseKnowledgeGraph:
    payload = graph.model_dump()
    preview = fix.get("preview")
    preview_dict = preview if isinstance(preview, dict) else {}
    edge_id = str(preview_dict.get("edge_id", ""))
    change_type = str(fix.get("change_type", ""))

    if change_type == "change_relation_type":
        after = preview_dict.get("after")
        after_dict = after if isinstance(after, dict) else {}
        new_relation = str(after_dict.get("relation_type", ""))
        for edge in payload["edges"]:
            if edge.get("edge_id") == edge_id:
                edge["relation_type"] = new_relation
                break

    return CourseKnowledgeGraph.model_validate(payload)


__all__ = ["apply_graph_fix"]
