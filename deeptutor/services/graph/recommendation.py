from __future__ import annotations

from collections import defaultdict, deque

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphRecommendation


def _build_prerequisite_maps(
    graph: CourseKnowledgeGraph,
) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    prerequisites: dict[str, set[str]] = defaultdict(set)
    downstream: dict[str, set[str]] = defaultdict(set)
    for edge in graph.edges:
        if edge.relation_type != "prerequisite":
            continue
        prerequisites[edge.target].add(edge.source)
        downstream[edge.source].add(edge.target)
    return prerequisites, downstream


def _collect_ancestors(node_ids: set[str], prerequisites: dict[str, set[str]]) -> set[str]:
    ancestors: set[str] = set()
    queue = deque(node_ids)
    while queue:
        node_id = queue.popleft()
        for parent_id in prerequisites.get(node_id, set()):
            if parent_id in ancestors:
                continue
            ancestors.add(parent_id)
            queue.append(parent_id)
    return ancestors


def _graph_distance(
    start_node_ids: set[str],
    target_node_id: str,
    prerequisites: dict[str, set[str]],
    downstream: dict[str, set[str]],
) -> int | None:
    if not start_node_ids:
        return None
    queue = deque((node_id, 0) for node_id in start_node_ids if node_id)
    seen = {node_id for node_id in start_node_ids if node_id}
    while queue:
        node_id, distance = queue.popleft()
        if node_id == target_node_id:
            return distance
        for neighbor_id in prerequisites.get(node_id, set()) | downstream.get(node_id, set()):
            if neighbor_id in seen:
                continue
            seen.add(neighbor_id)
            queue.append((neighbor_id, distance + 1))
    return None


def _count_unlocks(node_id: str, downstream: dict[str, set[str]]) -> int:
    visited: set[str] = set()
    queue = deque(downstream.get(node_id, set()))
    while queue:
        child_id = queue.popleft()
        if child_id in visited:
            continue
        visited.add(child_id)
        queue.extend(downstream.get(child_id, set()))
    return len(visited)


def recommend_next_graph_node(
    *,
    graph: CourseKnowledgeGraph,
    student_state: dict[str, object],
) -> GraphRecommendation:
    mastered = set(student_state.get("mastered_nodes", []) or [])
    explored = set(student_state.get("explored_nodes", []) or [])
    current_node_id = str(student_state.get("current_node_id", "") or "")
    active_remediation = student_state.get("active_remediation") or {}
    remediation_target_id = str(active_remediation.get("target_node_id", "") or "")

    if remediation_target_id:
        backup_candidates = [
            node.node_id
            for node in graph.nodes
            if node.node_id not in {remediation_target_id, *mastered}
        ][:2]
        return GraphRecommendation(
            recommended_node_id=remediation_target_id,
            mode="remediate",
            score=0.99,
            reason_codes=["recent_quiz_weakness"],
            backup_node_ids=backup_candidates,
        )

    prerequisites, downstream = _build_prerequisite_maps(graph)
    weak_nodes = set(student_state.get("weak_node_ids", []) or [])
    implicit_weak_nodes = {
        node_id
        for node_id in explored | ({current_node_id} if current_node_id else set())
        if prerequisites.get(node_id, set()) - mastered
    }
    weak_nodes |= implicit_weak_nodes
    remediation_targets = _collect_ancestors(weak_nodes, prerequisites) - mastered

    frontier = {node_id for node_id in explored | mastered if node_id}
    if current_node_id:
        frontier.add(current_node_id)

    candidates: list[tuple[float, GraphRecommendation]] = []

    for node in graph.nodes:
        node_id = node.node_id
        if node_id in mastered:
            continue

        prereqs = prerequisites.get(node_id, set())
        explored_prereqs = prereqs & explored
        mastered_prereqs = prereqs & mastered
        prereq_count = len(prereqs)
        readiness = (
            1.0
            if prereq_count == 0
            else (len(mastered_prereqs) + 0.5 * len(explored_prereqs)) / prereq_count
        )

        distance = _graph_distance(frontier, node_id, prerequisites, downstream)
        if not frontier:
            continuity = 0.8 if not prereqs else 0.6
        elif distance is None:
            continuity = 0.0
        else:
            continuity = max(0.2, 1.0 - 0.2 * distance)

        importance = min(_count_unlocks(node_id, downstream) / 3.0, 1.0)
        is_review = node_id in explored
        is_remediation = node_id in remediation_targets

        if is_remediation:
            weakness = 1.0
        elif node_id in weak_nodes:
            weakness = 0.85
        else:
            weakness = 0.0

        if is_remediation:
            if continuity == 0.0 and current_node_id:
                continue
            score = min(0.35 * weakness + 0.25 * readiness + 0.20 * importance + 0.20 * max(continuity, 0.4), 0.99)
            recommendation = GraphRecommendation(
                recommended_node_id=node_id,
                mode="remediate",
                score=score,
                reason_codes=["recent_quiz_weakness"],
                backup_node_ids=[],
            )
        elif is_review:
            if continuity == 0.0 and current_node_id:
                continue
            score = min(0.45 + 0.20 * max(continuity, 0.4) + 0.10 * importance, 0.99)
            recommendation = GraphRecommendation(
                recommended_node_id=node_id,
                mode="review",
                score=score,
                reason_codes=["needs_review_before_advance"],
                backup_node_ids=[],
            )
        else:
            if prereqs and readiness < 1.0:
                continue
            if continuity == 0.0 and frontier:
                continue
            score = min(0.35 * readiness + 0.20 * importance + 0.20 * max(continuity, 0.4) + 0.25, 0.99)
            reasons = ["prerequisites_ready"]
            if importance > 0:
                reasons.append("high_unlock_value")
            if continuity >= 0.6:
                reasons.append("close_to_current_path")
            recommendation = GraphRecommendation(
                recommended_node_id=node_id,
                mode="advance",
                score=score,
                reason_codes=reasons,
                backup_node_ids=[],
            )

        candidates.append((recommendation.score, recommendation))

    if not candidates:
        fallback = max(graph.nodes, key=lambda node: _count_unlocks(node.node_id, downstream), default=None)
        if fallback is None:
            raise ValueError("Course graph must contain at least one node")
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
