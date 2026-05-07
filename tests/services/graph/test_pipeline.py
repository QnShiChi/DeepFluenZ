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

    async def complete(self, prompt: str, **_: object) -> str:
        return self._responses.pop(0)


class RecordingStubLlm:
    def __init__(self, responses: list[str]) -> None:
        self._responses = responses
        self.calls: list[dict[str, object]] = []

    async def complete(self, prompt: str, **kwargs: object) -> str:
        self.calls.append({"prompt": prompt, **kwargs})
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
async def test_build_course_knowledge_graph_falls_back_to_deterministic_backbone_when_backbone_json_is_invalid() -> None:
    llm = StubLlm(
        [
            "not-json",
            "{}",
        ]
    )

    graph = await build_course_knowledge_graph(
        source_type="syllabus_pdf",
        course_id="oop-java",
        title="OOP Java",
        source_text="""
        BAI 1 Gioi thieu ve OOP
        1.1 Mot so khai niem
        1.2 Ngon ngu ho tro lap trinh huong doi tuong

        BAI 2 Gioi thieu ve Java
        2.1 Moi truong Java
        2.2 Cau truc chuong trinh Java
        """.strip(),
        llm=llm,
    )

    lesson_titles = [node.title for node in graph.nodes if node.node_type == "lesson"]
    subtopic_ordinals = [node.ordinal for node in graph.nodes if node.node_type == "subtopic"]

    assert lesson_titles == ["BAI 1 Gioi thieu ve OOP", "BAI 2 Gioi thieu ve Java"]
    assert subtopic_ordinals == ["1.1", "1.2", "2.1", "2.2"]
    assert any(edge.relation_type == "contains" for edge in graph.edges)
    assert "Backbone stage failed; rebuilt graph from deterministic syllabus structure." in graph.audit.warnings


@pytest.mark.anyio
async def test_build_course_knowledge_graph_deterministic_backbone_ignores_pdf_header_noise_and_keeps_lessons() -> None:
    llm = StubLlm(
        [
            "not-json",
            "{}",
        ]
    )

    graph = await build_course_knowledge_graph(
        source_type="syllabus_pdf",
        course_id="oop-java",
        title="OOP Java",
        source_text=(
            "BM03/QT2b/DBCL\n"
            "TRUONG DAI HOC CONG NGHE TP.HCM\n"
            "CUONG CHI TIET HOC PHAN\n"
            "BAI 1 Gioi thieu ve OOP\n"
            "1.1 Mot so khai niem\n"
            "1.2 Ngon ngu ho tro lap trinh huong doi tuong\n"
            "BAI 2 Cac khai niem co so cua OOP\n"
            "2.1 Kieu du lieu truu tuong\n"
            "2.2 Lop - the hien - bien doi tuong - thong diep\n"
        ),
        llm=llm,
    )

    top_level_titles = [node.title for node in graph.nodes if node.hierarchy_level == 0]
    subtopic_titles = [node.title for node in graph.nodes if node.node_type == "subtopic"]

    assert "BM03/QT2b/DBCL" not in top_level_titles
    assert top_level_titles == [
        "BAI 1 Gioi thieu ve OOP",
        "BAI 2 Cac khai niem co so cua OOP",
    ]
    assert subtopic_titles == [
        "1.1 Mot so khai niem",
        "1.2 Ngon ngu ho tro lap trinh huong doi tuong",
        "2.1 Kieu du lieu truu tuong",
        "2.2 Lop - the hien - bien doi tuong - thong diep",
    ]


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


@pytest.mark.anyio
async def test_build_course_knowledge_graph_requests_json_mode_for_llm_calls() -> None:
    llm = RecordingStubLlm(
        [
            """
            {
              "nodes": [
                {
                  "node_id": "lesson-1",
                  "title": "Bai 1",
                  "node_type": "lesson"
                }
              ],
              "edges": []
            }
            """,
            """
            {
              "nodes": [],
              "edges": []
            }
            """,
        ]
    )

    await build_course_knowledge_graph(
        source_type="syllabus_text",
        course_id="oop-java",
        title="OOP Java",
        source_text="Bai 1: Gioi thieu ve OOP",
        llm=llm,
    )

    assert len(llm.calls) == 2
    assert llm.calls[0]["response_format"] == {"type": "json_object"}
    assert llm.calls[1]["response_format"] == {"type": "json_object"}
