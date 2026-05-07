from __future__ import annotations


def build_backbone_prompt(normalized_syllabus_json: str) -> str:
    return (
        "You are extracting the syllabus backbone for a course knowledge graph.\n"
        "Return raw JSON with `nodes` and `edges` only.\n"
        "Rules:\n"
        "- Preserve numbered hierarchy such as `Bai 3`, `3.1`, `3.2`, `3.3`.\n"
        "- Major rows like `Bai 3` must become `lesson` nodes.\n"
        "- Numbered children like `3.1`, `3.2` must become `subtopic` nodes with `parent_node_id` pointing to the lesson.\n"
        "- Every node must include `node_id`, `title`, `description`, `node_type`, and, when available, `parent_node_id`, `ordinal`, `source_label`, `source_path`.\n"
        "- Emit `contains` edges for hierarchy and only use `prerequisite` when the syllabus clearly states dependency.\n"
        "- Every edge must include `edge_id`, `source`, `target`, `relation_type`, `confidence`, `rationale`, `source_refs`.\n"
        f"Normalized syllabus:\n{normalized_syllabus_json}"
    )


def build_enrichment_prompt(graph_json: str) -> str:
    return (
        "You are enriching a syllabus backbone into a course knowledge graph.\n"
        "Return raw JSON with optional `nodes` and `edges` only.\n"
        "Rules:\n"
        "- Every new node must include `node_id`, `title`, and `description`.\n"
        "- New nodes may only use `concept`, `skill`, or `application` for their `node_type`.\n"
        "- New edges may only use `builds_skill`, `applies_to`, `example_of`, or `related_to`.\n"
        "- Cross-links must include `confidence` and a short `rationale`.\n"
        f"Backbone graph:\n{graph_json}"
    )
