from __future__ import annotations

import json
from json import JSONDecodeError

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphAudit, ImportReport
from deeptutor.services.graph.normalizer import normalize_syllabus_text
from deeptutor.services.graph.prompts import build_backbone_prompt, build_enrichment_prompt
from deeptutor.services.graph.validator import validate_course_knowledge_graph


def _parse_llm_json(raw_text: str) -> dict:
    cleaned = (raw_text or "").strip()
    if not cleaned:
        raise JSONDecodeError("Empty LLM response", raw_text or "", 0)

    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _sanitize_node(raw_node: dict, *, index: int, default_node_type: str, default_id_prefix: str) -> dict:
    node_id = str(raw_node.get("node_id") or f"{default_id_prefix}-{index}").strip()
    title = str(raw_node.get("title") or node_id or f"Untitled {index + 1}").strip() or node_id
    node_type = str(raw_node.get("node_type") or default_node_type).strip() or default_node_type
    difficulty = str(raw_node.get("difficulty") or "medium").strip().lower()
    difficulty_aliases = {
        "low": "easy",
        "easy": "easy",
        "basic": "easy",
        "medium": "medium",
        "moderate": "medium",
        "normal": "medium",
        "intermediate": "medium",
        "high": "hard",
        "hard": "hard",
        "advanced": "hard",
    }

    return {
        "node_id": node_id,
        "title": title,
        "node_type": node_type,
        "description": str(raw_node.get("description") or "").strip(),
        "difficulty": difficulty_aliases.get(difficulty, "medium"),
        "hierarchy_level": int(raw_node.get("hierarchy_level") or 0),
        "parent_node_id": str(raw_node.get("parent_node_id") or "").strip(),
        "ordinal": str(raw_node.get("ordinal") or "").strip(),
        "source_label": str(raw_node.get("source_label") or "").strip(),
        "source_path": list(raw_node.get("source_path") or []),
        "layout_group_id": str(raw_node.get("layout_group_id") or "").strip(),
        "layout_priority": int(raw_node.get("layout_priority") or 0),
        "learning_outcomes": list(raw_node.get("learning_outcomes") or []),
        "examples": list(raw_node.get("examples") or []),
        "related_questions": list(raw_node.get("related_questions") or []),
        "resources": list(raw_node.get("resources") or []),
        "source_refs": list(raw_node.get("source_refs") or []),
    }


def _sanitize_edge(
    raw_edge: dict,
    *,
    index: int,
    default_relation_type: str,
    default_confidence: float,
    default_id_prefix: str,
) -> dict | None:
    source = str(raw_edge.get("source") or "").strip()
    target = str(raw_edge.get("target") or "").strip()
    if not source or not target:
        return None

    return {
        "edge_id": str(raw_edge.get("edge_id") or f"{default_id_prefix}-{index}").strip() or f"{default_id_prefix}-{index}",
        "source": source,
        "target": target,
        "relation_type": str(raw_edge.get("relation_type") or default_relation_type).strip() or default_relation_type,
        "confidence": raw_edge.get("confidence") if raw_edge.get("confidence") is not None else default_confidence,
        "rationale": str(raw_edge.get("rationale") or "").strip(),
        "source_refs": list(raw_edge.get("source_refs") or []),
    }


def _sanitize_graph_fragment(
    raw_fragment: dict,
    *,
    default_node_type: str,
    default_relation_type: str,
    default_confidence: float,
    node_id_prefix: str,
    edge_id_prefix: str,
) -> dict:
    raw_nodes = raw_fragment.get("nodes") or []
    raw_edges = raw_fragment.get("edges") or []

    nodes = [
        _sanitize_node(
            raw_node,
            index=index,
            default_node_type=default_node_type,
            default_id_prefix=node_id_prefix,
        )
        for index, raw_node in enumerate(raw_nodes)
        if isinstance(raw_node, dict)
    ]

    edges = []
    for index, raw_edge in enumerate(raw_edges):
        if not isinstance(raw_edge, dict):
            continue
        sanitized = _sanitize_edge(
            raw_edge,
            index=index,
            default_relation_type=default_relation_type,
            default_confidence=default_confidence,
            default_id_prefix=edge_id_prefix,
        )
        if sanitized is not None:
            edges.append(sanitized)

    return {"nodes": nodes, "edges": edges}


def merge_course_graph_layers(backbone_data: dict, enrichment_data: dict) -> CourseKnowledgeGraph:
    backbone = _sanitize_graph_fragment(
        backbone_data,
        default_node_type="lesson",
        default_relation_type="contains",
        default_confidence=1.0,
        node_id_prefix="backbone-node",
        edge_id_prefix="backbone-edge",
    )
    enrichment = _sanitize_graph_fragment(
        enrichment_data,
        default_node_type="concept",
        default_relation_type="related_to",
        default_confidence=0.5,
        node_id_prefix="enrichment-node",
        edge_id_prefix="enrichment-edge",
    )

    payload = {
        "course_id": str(backbone_data.get("course_id") or ""),
        "title": str(backbone_data.get("title") or ""),
        "source_type": str(backbone_data.get("source_type") or "syllabus_text"),
        "source_summary": str(backbone_data.get("source_summary") or ""),
        "import_version": "v1",
        "nodes": [*backbone["nodes"], *enrichment["nodes"]],
        "edges": [*backbone["edges"], *enrichment["edges"]],
        "audit": {
            "backbone_node_ids": [node["node_id"] for node in backbone["nodes"]],
            "enriched_node_ids": [node["node_id"] for node in enrichment["nodes"]],
            "backbone_edge_ids": [edge["edge_id"] for edge in backbone["edges"]],
            "enriched_edge_ids": [edge["edge_id"] for edge in enrichment["edges"]],
            "warnings": list((backbone_data.get("audit") or {}).get("warnings") or []),
        },
    }
    return CourseKnowledgeGraph.model_validate(payload)


async def build_course_knowledge_graph(
    *,
    source_type: str,
    course_id: str,
    title: str,
    source_text: str,
    llm,
) -> CourseKnowledgeGraph:
    normalized = normalize_syllabus_text(source_text)

    backbone_raw = await llm.complete(build_backbone_prompt(normalized.model_dump_json()))
    backbone_data = _sanitize_graph_fragment(
        _parse_llm_json(backbone_raw),
        default_node_type="topic",
        default_relation_type="prerequisite",
        default_confidence=1.0,
        node_id_prefix="backbone-node",
        edge_id_prefix="backbone-edge",
    )

    backbone_edges = backbone_data.get("edges", [])
    payload = {
        "course_id": course_id,
        "title": title,
        "source_type": source_type,
        "source_summary": normalized.source_summary,
        "import_version": "v1",
        "nodes": backbone_data["nodes"],
        "edges": backbone_edges,
        "audit": GraphAudit(
            backbone_node_ids=[node["node_id"] for node in backbone_data["nodes"]],
            enriched_node_ids=[],
            backbone_edge_ids=[edge["edge_id"] for edge in backbone_edges],
            enriched_edge_ids=[],
            warnings=[],
        ).model_dump(),
        "import_report": ImportReport(
            status="backbone_only",
            topic_node_count=sum(1 for node in backbone_data["nodes"] if node["node_type"] in {"topic", "lesson"}),
            enrichment_node_count=0,
            edge_count=len(backbone_edges),
            cross_link_count=0,
            warning_count=0,
        ).model_dump(),
    }

    try:
        enrichment_raw = await llm.complete(build_enrichment_prompt(json.dumps(payload)))
        enrichment = _sanitize_graph_fragment(
            _parse_llm_json(enrichment_raw),
            default_node_type="concept",
            default_relation_type="related_to",
            default_confidence=0.5,
            node_id_prefix="enrichment-node",
            edge_id_prefix="enrichment-edge",
        )
        payload["nodes"].extend(enrichment.get("nodes", []))
        payload["edges"].extend(enrichment.get("edges", []))
        payload["audit"]["enriched_node_ids"] = [node["node_id"] for node in enrichment.get("nodes", [])]
        payload["audit"]["enriched_edge_ids"] = [edge["edge_id"] for edge in enrichment.get("edges", [])]
        payload["import_report"]["status"] = "enriched"
        payload["import_report"]["enrichment_node_count"] = len(enrichment.get("nodes", []))
        payload["import_report"]["edge_count"] = len(payload["edges"])
        payload["import_report"]["cross_link_count"] = sum(
            1 for edge in enrichment.get("edges", []) if edge.get("relation_type") == "related_to"
        )
    except Exception:
        payload["audit"]["warnings"].append("Enrichment stage failed; saved backbone-only graph.")

    return validate_course_knowledge_graph(payload)
