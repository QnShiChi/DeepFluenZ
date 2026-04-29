from __future__ import annotations

from collections import defaultdict

from deeptutor.services.graph.models import CourseKnowledgeGraph


def build_remediation_cache_key(target_node_id: str, weak_concepts: list[str]) -> str:
    normalized = "|".join(sorted({concept.strip() for concept in weak_concepts if concept.strip()}))
    return f"{target_node_id}::{normalized}"


def _build_prerequisites(graph: CourseKnowledgeGraph) -> dict[str, list[str]]:
    prerequisites: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        if edge.relation_type == "prerequisite":
            prerequisites[edge.target].append(edge.source)
    return prerequisites


def resolve_remediation_target(
    *,
    graph: CourseKnowledgeGraph,
    source_node_id: str,
    weak_concepts: list[str],
    mastered_nodes: list[str],
    prerequisite_weakness: bool,
) -> dict[str, object]:
    if not prerequisite_weakness:
        return {
            "target_node_id": source_node_id,
            "weak_concepts": weak_concepts,
        }

    prerequisites = _build_prerequisites(graph)
    mastered = set(mastered_nodes)
    for prerequisite_id in prerequisites.get(source_node_id, []):
        if prerequisite_id not in mastered:
            return {
                "target_node_id": prerequisite_id,
                "weak_concepts": weak_concepts,
            }

    return {
        "target_node_id": source_node_id,
        "weak_concepts": weak_concepts,
    }


def create_or_update_remediation_state(
    current_state: dict[str, object],
    *,
    source_node_id: str,
    target_node_id: str,
    weak_concepts: list[str],
    failure_severity: str,
    score_ratio: float,
) -> dict[str, object]:
    next_state = dict(current_state)
    next_state["active_remediation"] = {
        "source_node_id": source_node_id,
        "target_node_id": target_node_id,
        "weak_concepts": weak_concepts,
        "failure_severity": failure_severity,
        "status": "recommended",
        "attempt_count": 0,
        "last_node_quiz_score": score_ratio,
        "last_remediation_quiz_score": None,
    }
    return next_state


def mark_remediation_mini_quiz_passed(
    current_state: dict[str, object],
    *,
    score_ratio: float,
) -> dict[str, object]:
    next_state = dict(current_state)
    active = dict(next_state.get("active_remediation") or {})
    active["status"] = "passed_mini_quiz"
    active["last_remediation_quiz_score"] = score_ratio
    next_state["active_remediation"] = active
    return next_state


def mark_remediation_mini_quiz_failed(
    current_state: dict[str, object],
    *,
    score_ratio: float,
) -> dict[str, object]:
    next_state = dict(current_state)
    active = dict(next_state.get("active_remediation") or {})
    active["status"] = "recommended"
    active["attempt_count"] = int(active.get("attempt_count", 0) or 0) + 1
    active["last_remediation_quiz_score"] = score_ratio
    next_state["active_remediation"] = active
    return next_state


def clear_completed_remediation(
    current_state: dict[str, object],
    *,
    passed_node_id: str,
) -> dict[str, object]:
    next_state = dict(current_state)
    active = next_state.get("active_remediation") or {}
    if active.get("status") == "passed_mini_quiz" and active.get("source_node_id") == passed_node_id:
        next_state["active_remediation"] = None
    return next_state
