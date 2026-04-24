from __future__ import annotations

from pydantic import BaseModel, Field


class NormalizedSection(BaseModel):
    title: str
    body: str


class NormalizedSyllabus(BaseModel):
    source_summary: str
    sections: list[NormalizedSection] = Field(default_factory=list)


def normalize_syllabus_text(text: str) -> NormalizedSyllabus:
    raw_sections = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]
    sections: list[NormalizedSection] = []
    for raw in raw_sections:
        lines = [line.strip() for line in raw.splitlines() if line.strip()]
        title = lines[0]
        body = "\n".join(lines[1:])
        sections.append(NormalizedSection(title=title, body=body))

    return NormalizedSyllabus(
        source_summary=f"{len(sections)} sections",
        sections=sections,
    )
