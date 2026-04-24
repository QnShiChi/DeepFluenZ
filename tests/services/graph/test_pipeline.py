from deeptutor.services.graph.normalizer import normalize_syllabus_text


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
