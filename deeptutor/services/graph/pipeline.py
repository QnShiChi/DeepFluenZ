from __future__ import annotations

import json
from json import JSONDecodeError
import re

from deeptutor.services.graph.models import CourseKnowledgeGraph, GraphAudit, ImportReport
from deeptutor.services.graph.normalizer import NormalizedSyllabus, normalize_syllabus_text
from deeptutor.services.graph.prompts import build_backbone_prompt, build_enrichment_prompt
from deeptutor.services.graph.validator import validate_course_knowledge_graph

MAX_CHILD_CONCEPTS_PER_SUBTOPIC = 5
LESSON_PATTERN = re.compile(r"^(?P<label>(?:bai|bài|chuong|chương|chapter|week)\s*\d+)\s*[:.\-)]?\s*(?P<title>.+)?$", re.IGNORECASE)
SUBTOPIC_PATTERN = re.compile(r"^(?P<ordinal>\d+(?:\.\d+)+)\.?\s+(?P<title>.+)$")
ALLOWED_NODE_TYPES = {"topic", "concept", "skill", "application", "lesson", "subtopic"}
NODE_TYPE_ALIASES = {
    "sub_topic": "subtopic",
    "sub-topic": "subtopic",
    "module": "lesson",
    "chapter": "lesson",
}


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
    raw_node_type = str(raw_node.get("node_type") or default_node_type).strip().lower()
    node_type = NODE_TYPE_ALIASES.get(raw_node_type, raw_node_type) or default_node_type
    if node_type not in ALLOWED_NODE_TYPES:
        node_type = default_node_type
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


def _prune_enriched_children(nodes: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = {}
    root_nodes: list[dict] = []
    for node in nodes:
        parent_id = str(node.get("parent_node_id") or "").strip()
        if not parent_id:
            root_nodes.append(node)
            continue
        grouped.setdefault(parent_id, []).append(node)

    pruned = list(root_nodes)
    for parent_id, group in grouped.items():
        ordered = sorted(
            group,
            key=lambda item: (
                int(item.get("layout_priority") or 0),
                str(item.get("ordinal") or ""),
                str(item.get("title") or ""),
            ),
        )
        pruned.extend(ordered[:MAX_CHILD_CONCEPTS_PER_SUBTOPIC])
    return pruned


def _slugify_token(value: str) -> str:
    lowered = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return lowered or "node"


def _build_outline_backbone_from_lines(lines: list[str]) -> dict | None:
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_node_ids: set[str] = set()
    lesson_counter = 0
    current_lesson_node_id = ""
    current_lesson_title = ""

    def add_node(raw_node: dict) -> str:
        node_id = str(raw_node["node_id"])
        if node_id in seen_node_ids:
            suffix = 2
            base = node_id
            while f"{base}-{suffix}" in seen_node_ids:
                suffix += 1
            node_id = f"{base}-{suffix}"
            raw_node = {**raw_node, "node_id": node_id}
        seen_node_ids.add(node_id)
        nodes.append(raw_node)
        return node_id

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        lesson_match = LESSON_PATTERN.match(line)
        if lesson_match:
            lesson_counter += 1
            ordinal = re.search(r"\d+", lesson_match.group("label") or "")
            lesson_ordinal = ordinal.group(0) if ordinal else str(lesson_counter)
            current_lesson_node_id = add_node(
                {
                    "node_id": f"lesson-{lesson_ordinal}",
                    "title": line,
                    "description": "",
                    "node_type": "lesson",
                    "hierarchy_level": 0,
                    "ordinal": lesson_ordinal,
                    "source_label": lesson_match.group("label") or f"Bai {lesson_ordinal}",
                    "source_path": [line],
                    "source_refs": [{"section_title": line, "snippet": line[:240]}],
                }
            )
            current_lesson_title = line
            continue

        subtopic_match = SUBTOPIC_PATTERN.match(line)
        if not subtopic_match or not current_lesson_node_id:
            continue
        ordinal = subtopic_match.group("ordinal")
        subtopic_id = add_node(
            {
                "node_id": f"subtopic-{ordinal.replace('.', '-')}",
                "title": line,
                "description": subtopic_match.group("title").strip(),
                "node_type": "subtopic",
                "hierarchy_level": 1,
                "parent_node_id": current_lesson_node_id,
                "ordinal": ordinal,
                "source_label": ordinal,
                "source_path": [current_lesson_title, line],
                "source_refs": [{"section_title": current_lesson_title, "snippet": line[:240]}],
            }
        )
        edges.append(
            {
                "edge_id": f"contains-{current_lesson_node_id}-{subtopic_id}",
                "source": current_lesson_node_id,
                "target": subtopic_id,
                "relation_type": "contains",
                "confidence": 1.0,
                "rationale": "Deterministic syllabus hierarchy fallback",
                "source_refs": [{"section_title": current_lesson_title, "snippet": line[:240]}],
            }
        )

    if not nodes:
        return None

    return {"nodes": nodes, "edges": edges}


def _build_deterministic_backbone(normalized: NormalizedSyllabus) -> dict:
    all_lines = [
        line.strip()
        for section in normalized.sections
        for line in [section.title, *section.body.splitlines()]
        if line.strip()
    ]

    outline_backbone = _build_outline_backbone_from_lines(all_lines)
    if outline_backbone is not None:
        return outline_backbone

    nodes: list[dict] = []
    seen_node_ids: set[str] = set()

    def add_node(raw_node: dict) -> str:
        node_id = str(raw_node["node_id"])
        if node_id in seen_node_ids:
            suffix = 2
            base = node_id
            while f"{base}-{suffix}" in seen_node_ids:
                suffix += 1
            node_id = f"{base}-{suffix}"
            raw_node = {**raw_node, "node_id": node_id}
        seen_node_ids.add(node_id)
        nodes.append(raw_node)
        return node_id

    for index, section in enumerate(normalized.sections, start=1):
        section_title = section.title.strip()
        add_node(
            {
                "node_id": f"topic-{_slugify_token(section_title)}",
                "title": section_title,
                "description": section.body.strip(),
                "node_type": "topic",
                "hierarchy_level": 0,
                "ordinal": str(index),
                "source_label": section_title,
                "source_path": [section_title],
                "source_refs": [{"section_title": section_title, "snippet": section.body[:240]}],
            }
        )

    if not nodes:
        fallback_title = normalized.sections[0].title if normalized.sections else "Course overview"
        nodes.append(
            {
                "node_id": "topic-overview",
                "title": fallback_title,
                "description": normalized.sections[0].body if normalized.sections else "",
                "node_type": "topic",
                "hierarchy_level": 0,
                "ordinal": "1",
                "source_label": fallback_title,
                "source_path": [fallback_title],
                "source_refs": [{"section_title": fallback_title, "snippet": ""}],
            }
        )

    return {"nodes": nodes, "edges": []}


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
    allowed_enriched_node_ids = {
        node["node_id"]
        for node in _prune_enriched_children(enrichment["nodes"])
    }
    enrichment["nodes"] = [
        node for node in enrichment["nodes"] if node["node_id"] in allowed_enriched_node_ids
    ]
    enrichment["edges"] = [
        edge
        for edge in enrichment["edges"]
        if edge["source"] in allowed_enriched_node_ids
        or edge["target"] in allowed_enriched_node_ids
        or edge["source"] in {node["node_id"] for node in backbone["nodes"]}
    ]

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
    warnings: list[str] = []

    llm_kwargs = {"response_format": {"type": "json_object"}}

    try:
        backbone_raw = await llm.complete(
            build_backbone_prompt(normalized.model_dump_json()),
            **llm_kwargs,
        )
        backbone_data = _sanitize_graph_fragment(
            _parse_llm_json(backbone_raw),
            default_node_type="topic",
            default_relation_type="prerequisite",
            default_confidence=1.0,
            node_id_prefix="backbone-node",
            edge_id_prefix="backbone-edge",
        )
    except JSONDecodeError:
        backbone_data = _sanitize_graph_fragment(
            _build_deterministic_backbone(normalized),
            default_node_type="topic",
            default_relation_type="contains",
            default_confidence=1.0,
            node_id_prefix="backbone-node",
            edge_id_prefix="backbone-edge",
        )
        warnings.append("Backbone stage failed; rebuilt graph from deterministic syllabus structure.")

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
            warnings=warnings,
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
        enrichment_raw = await llm.complete(
            build_enrichment_prompt(json.dumps(payload)),
            **llm_kwargs,
        )
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
