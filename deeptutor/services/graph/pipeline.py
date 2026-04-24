from __future__ import annotations

import json

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphAudit, ImportReport
from deeptutor.services.graph.normalizer import normalize_syllabus_text
from deeptutor.services.graph.prompts import build_backbone_prompt, build_enrichment_prompt
from deeptutor.services.graph.validator import validate_course_knowledge_graph


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
    backbone_data = json.loads(backbone_raw)

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
            topic_node_count=sum(1 for node in backbone_data["nodes"] if node["node_type"] == "topic"),
            enrichment_node_count=0,
            edge_count=len(backbone_edges),
            cross_link_count=0,
            warning_count=0,
        ).model_dump(),
    }

    try:
        enrichment_raw = await llm.complete(build_enrichment_prompt(json.dumps(payload)))
        enrichment = json.loads(enrichment_raw)
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
