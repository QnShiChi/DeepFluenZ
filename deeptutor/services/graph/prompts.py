from __future__ import annotations


def build_backbone_prompt(normalized_syllabus_json: str) -> str:
    return (
        "You are extracting the syllabus backbone for a course knowledge graph.\n"
        "Return raw JSON with `nodes` and `edges` only.\n"
        "Rules:\n"
        "- Only create `topic` nodes.\n"
        "- Only create `part_of` or `prerequisite` edges.\n"
        "- Every edge must include `edge_id`, `source`, `target`, `relation_type`, `confidence`, `rationale`, `source_refs`.\n"
        f"Normalized syllabus:\n{normalized_syllabus_json}"
    )


def build_enrichment_prompt(graph_json: str) -> str:
    return (
        "You are enriching a syllabus backbone into a course knowledge graph.\n"
        "Return raw JSON with optional `nodes` and `edges` only.\n"
        "Rules:\n"
        "- New nodes may only use `concept`, `skill`, or `application`.\n"
        "- New edges may only use `builds_skill`, `applies_to`, `example_of`, or `related_to`.\n"
        "- Cross-links must include `confidence` and a short `rationale`.\n"
        f"Backbone graph:\n{graph_json}"
    )
