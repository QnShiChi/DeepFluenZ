import pytest

from deeptutor.services.graph.normalizer import normalize_syllabus_text
from deeptutor.services.graph.pipeline import build_course_knowledge_graph


def test_normalize_syllabus_text_groups_lines_into_sections() -> None:
    text = """
    Week 1: Introduction to AI
    Topics: history of AI, applications

    Week 2: Search
    Topics: uninformed search, informed search
    """.strip()

    normalized = normalize_syllabus_text(text)

    assert normalized.source_summary == "2 sections"
    assert normalized.sections[0].title == "Week 1: Introduction to AI"
    assert "history of AI" in normalized.sections[0].body


class StubLlm:
    def __init__(self, responses: list[str]) -> None:
        self._responses = responses

    async def complete(self, prompt: str) -> str:
        return self._responses.pop(0)


@pytest.mark.anyio
async def test_build_course_knowledge_graph_falls_back_to_backbone_only() -> None:
    llm = StubLlm(
        [
            """
            {
              "nodes": [
                {
                  "node_id": "topic_intro",
                  "title": "Introduction to AI",
                  "node_type": "topic",
                  "description": "Overview",
                  "difficulty": "easy",
                  "learning_outcomes": [],
                  "examples": [],
                  "related_questions": [],
                  "resources": [],
                  "source_refs": [{"section_title": "Week 1", "snippet": "Introduction to AI"}]
                }
              ],
              "edges": []
            }
            """,
            "not-json",
        ]
    )

    graph = await build_course_knowledge_graph(
        source_type="syllabus_text",
        course_id="intro-ai",
        title="Intro to AI",
        source_text="Week 1: Introduction to AI",
        llm=llm,
    )

    assert graph.import_report is not None
    assert graph.import_report.status == "backbone_only"
    assert graph.audit.warnings == ["Enrichment stage failed; saved backbone-only graph."]


@pytest.mark.anyio
async def test_build_course_knowledge_graph_accepts_fenced_backbone_json() -> None:
    llm = StubLlm(
        [
            """```json
            {
              "nodes": [
                {
                  "node_id": "topic_intro",
                  "title": "Introduction to AI",
                  "node_type": "topic",
                  "description": "Overview",
                  "difficulty": "easy",
                  "learning_outcomes": [],
                  "examples": [],
                  "related_questions": [],
                  "resources": [],
                  "source_refs": [{"section_title": "Week 1", "snippet": "Introduction to AI"}]
                }
              ],
              "edges": []
            }
            ```""",
            "{}",
        ]
    )

    graph = await build_course_knowledge_graph(
        source_type="syllabus_text",
        course_id="intro-ai",
        title="Intro to AI",
        source_text="Week 1: Introduction to AI",
        llm=llm,
    )

    assert graph.course_id == "intro-ai"
    assert len(graph.nodes) == 1
    assert graph.nodes[0].node_id == "topic_intro"


@pytest.mark.anyio
async def test_build_course_knowledge_graph_defaults_missing_backbone_node_type() -> None:
    llm = StubLlm(
        [
            """
            {
              "nodes": [
                {
                  "node_id": "topic_intro",
                  "title": "Introduction to AI"
                }
              ],
              "edges": []
            }
            """,
            "{}",
        ]
    )

    graph = await build_course_knowledge_graph(
        source_type="syllabus_text",
        course_id="intro-ai",
        title="Intro to AI",
        source_text="Week 1: Introduction to AI",
        llm=llm,
    )

    assert len(graph.nodes) == 1
    assert graph.nodes[0].node_type == "topic"
    assert graph.import_report is not None
    assert graph.import_report.topic_node_count == 1


@pytest.mark.anyio
async def test_build_course_knowledge_graph_skips_enrichment_edges_missing_endpoints() -> None:
    llm = StubLlm(
        [
            """
            {
              "nodes": [
                {
                  "node_id": "topic_intro",
                  "title": "Introduction to AI",
                  "node_type": "topic"
                }
              ],
              "edges": []
            }
            """,
            """
            {
              "nodes": [
                {
                  "title": "Search Space"
                }
              ],
              "edges": [
                {
                  "edge_id": "broken-edge"
                }
              ]
            }
            """,
        ]
    )

    graph = await build_course_knowledge_graph(
        source_type="syllabus_text",
        course_id="intro-ai",
        title="Intro to AI",
        source_text="Week 1: Introduction to AI",
        llm=llm,
    )

    assert len(graph.nodes) == 2
    assert graph.nodes[1].node_type == "concept"
    assert graph.nodes[1].node_id == "enrichment-node-0"
    assert graph.edges == []


@pytest.mark.anyio
async def test_build_course_knowledge_graph_normalizes_difficulty_labels() -> None:
    llm = StubLlm(
        [
            """
            {
              "nodes": [
                {
                  "node_id": "topic_intro",
                  "title": "Introduction to AI",
                  "node_type": "topic",
                  "difficulty": "high"
                }
              ],
              "edges": []
            }
            """,
            """
            {
              "nodes": [
                {
                  "node_id": "concept_search",
                  "title": "Search Space",
                  "difficulty": "low"
                }
              ],
              "edges": []
            }
            """,
        ]
    )

    graph = await build_course_knowledge_graph(
        source_type="syllabus_text",
        course_id="intro-ai",
        title="Intro to AI",
        source_text="Week 1: Introduction to AI",
        llm=llm,
    )

    assert graph.nodes[0].difficulty == "hard"
    assert graph.nodes[1].difficulty == "easy"
