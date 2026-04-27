from __future__ import annotations

from collections import defaultdict

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation


def recommend_next_graph_node(
    *,
    graph: CourseKnowledgeGraph,
    student_state: dict[str, object],
) -> GraphRecommendation:
    mastered = set(student_state.get("mastered_nodes", []) or [])
    explored = set(student_state.get("explored_nodes", []) or [])
    current_node_id = str(student_state.get("current_node_id", "") or "")

    prerequisites: dict[str, set[str]] = defaultdict(set)
    unlock_counts: dict[str, int] = defaultdict(int)
    for edge in graph.edges:
        if edge.relation_type != "prerequisite":
            continue
        prerequisites[edge.target].add(edge.source)
        unlock_counts[edge.source] += 1

    candidates: list[tuple[float, GraphRecommendation]] = []

    for node in graph.nodes:
        if node.node_id in mastered:
            continue

        prereqs = prerequisites.get(node.node_id, set())
        readiness = 1.0 if not prereqs else len(prereqs & mastered) / len(prereqs)
        if prereqs and readiness < 1.0 and node.node_id not in explored:
            continue

        continuity = 1.0 if node.node_id == current_node_id else 0.6
        importance = min(unlock_counts.get(node.node_id, 0) / 3.0, 1.0)

        if node.node_id in explored:
            score = min(0.45 + 0.20 * continuity + 0.10 * importance, 0.99)
            recommendation = GraphRecommendation(
                recommended_node_id=node.node_id,
                mode="review",
                score=score,
                reason_codes=["needs_review_before_advance"],
                backup_node_ids=[],
            )
        else:
            score = min(0.35 * readiness + 0.20 * importance + 0.20 * continuity + 0.25, 0.99)
            reasons = ["prerequisites_ready"]
            if importance > 0:
                reasons.append("high_unlock_value")
            if continuity > 0.5:
                reasons.append("close_to_current_path")
            recommendation = GraphRecommendation(
                recommended_node_id=node.node_id,
                mode="advance",
                score=score,
                reason_codes=reasons,
                backup_node_ids=[],
            )

        candidates.append((recommendation.score, recommendation))

    if not candidates:
        fallback = next(node for node in graph.nodes)
        return GraphRecommendation(
            recommended_node_id=fallback.node_id,
            mode="review",
            score=0.0,
            reason_codes=["needs_review_before_advance"],
            backup_node_ids=[],
        )

    candidates.sort(key=lambda item: item[0], reverse=True)
    primary = candidates[0][1]
    backups = [candidate.recommended_node_id for _, candidate in candidates[1:3]]
    return primary.model_copy(update={"backup_node_ids": backups})
