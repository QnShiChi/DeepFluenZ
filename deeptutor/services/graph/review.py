from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta

from deeptutor.services.graph.models import CourseKnowledgeGraph


def build_default_review_state() -> dict[str, object]:
    return {"nodes": {}, "queue": []}


def record_review_signal(
    *,
    review_state: dict[str, object] | None,
    signal_type: str,
    node_id: str,
    occurred_at: str,
    score_ratio: float | None = None,
) -> dict[str, object]:
    snapshot = deepcopy(review_state or build_default_review_state())
    nodes = snapshot.setdefault("nodes", {})
    node_state = dict(nodes.get(node_id) or {})
    node_state.setdefault("last_reviewed_at", "")
    node_state.setdefault("due_at", "")
    node_state.setdefault("forgetting_risk", 0.0)
    node_state.setdefault("retrievability", 1.0)
    node_state.setdefault("review_mode", "light_recall_check")

    happened_at = datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))

    if signal_type == "quiz_failed":
        node_state["forgetting_risk"] = 0.8 if (score_ratio or 0.0) <= 0.5 else 0.65
        node_state["retrievability"] = 0.35 if (score_ratio or 0.0) <= 0.5 else 0.5
        node_state["review_mode"] = "focused_review"
        node_state["due_at"] = (happened_at + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    elif signal_type == "quiz_passed":
        node_state["forgetting_risk"] = 0.35
        node_state["retrievability"] = 0.78
        node_state["review_mode"] = "light_recall_check"
        node_state["last_reviewed_at"] = occurred_at
        node_state["due_at"] = (happened_at + timedelta(days=4)).isoformat().replace("+00:00", "Z")
    else:
        node_state["forgetting_risk"] = min(0.55, float(node_state["forgetting_risk"]) + 0.1)
        node_state["review_mode"] = "light_recall_check"
        node_state["due_at"] = (happened_at + timedelta(days=2)).isoformat().replace("+00:00", "Z")

    nodes[node_id] = node_state
    snapshot["nodes"] = nodes
    return snapshot


def rank_review_queue(
    *,
    graph: CourseKnowledgeGraph,
    review_state: dict[str, object] | None,
    active_path_node_ids: list[str],
    now: str,
) -> list[dict[str, object]]:
    del active_path_node_ids
    del now

    nodes = dict((review_state or {}).get("nodes") or {})
    downstream = {
        node.node_id: {
            edge.target
            for edge in graph.edges
            if edge.relation_type == "prerequisite" and edge.source == node.node_id
        }
        for node in graph.nodes
    }

    def blocking_weight(node_id: str) -> float:
        return min(len(downstream.get(node_id, set())) / 2.0, 1.0)

    entries: list[dict[str, object]] = []
    for node_id, raw in nodes.items():
        risk = float(raw.get("forgetting_risk") or 0.0)
        if risk < 0.45:
            continue
        reasons = ["needs_review_before_advance"]
        if blocking_weight(node_id) > 0:
            reasons.append("high_unlock_value")
        score = min(0.65 * risk + 0.35 * blocking_weight(node_id), 0.99)
        entries.append(
            {
                "node_id": node_id,
                "review_mode": raw.get("review_mode", "light_recall_check"),
                "score": score,
                "due_at": str(raw.get("due_at") or ""),
                "reason_codes": reasons,
            }
        )

    entries.sort(key=lambda item: float(item["score"]), reverse=True)
    return entries[:3]
