# Course Knowledge Graph Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade syllabus import from a thin course-outline graph into a course knowledge graph with typed nodes, typed relations, controlled enrichment, audit metadata, and safe compatibility with the existing session-bound graph viewer.

**Architecture:** Keep `course_id`-bound graph templates as the persistence anchor, but replace the loose JSON payload with validated graph models and a staged import pipeline: normalize source, extract syllabus backbone, enrich with controlled semantic nodes and edges, then validate and persist. Preserve current session binding and viewer entry points while adding enough compatibility code for richer graph payloads to load without breaking the workspace.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session storage, existing LLM client, pytest, TypeScript, React/Next.js, Node test runner for web utility tests.

---

## File Structure

### Backend graph domain

- Modify: `deeptutor/services/graph/models.py`
  - Replace the current minimal dataclasses with typed graph models that represent course metadata, nodes, edges, resources, source references, audit details, and import reports.
- Create: `deeptutor/services/graph/pipeline.py`
  - Implement the staged import pipeline entry points and graph assembly helpers.
- Create: `deeptutor/services/graph/normalizer.py`
  - Normalize PDF or raw syllabus text into structured sections suitable for backbone extraction.
- Create: `deeptutor/services/graph/validator.py`
  - Enforce schema rules, sanitize mild issues, and emit warnings for degraded imports.
- Create: `deeptutor/services/graph/prompts.py`
  - Hold prompt builders for backbone extraction and controlled enrichment to keep router code thin.

### Backend API and persistence

- Modify: `deeptutor/api/routers/course_templates.py:12-138`
  - Replace the direct prompt-and-store flow with pipeline orchestration, import report responses, and validated JSON import handling.
- Modify: `deeptutor/services/session/sqlite_store.py:217-233`
  - Keep persistence backward-compatible and explicitly retain audit/import report data inside `template_json` for this first slice.
- Modify: `deeptutor/services/session/sqlite_store.py:1356-1418`
  - Keep using the existing upsert/get helpers, but persist the richer validated graph payload unchanged inside `template_json`.
- Modify: `deeptutor/api/main.py:223-241`
  - Leave router registration unchanged; the work stays inside the existing `course_templates` router.

### Frontend compatibility

- Create: `web/lib/course-knowledge-graph.ts`
  - Add mapping helpers that convert the richer graph payload into React Flow nodes and edges, preserving session-bound `course_id` behavior.
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx:1-264`
  - Replace inline node/edge mapping with the shared helper and tolerate typed relations, metadata, and audit-bearing payloads.
- Modify: `web/lib/session-api.ts:22-73`
  - Leave the existing `course_id` preference shape untouched; no new session preference fields are introduced in this slice.

### Tests

- Modify: `tests/services/graph/test_models.py`
  - Replace the current minimal model tests with validation tests for node types, relation types, metadata, and audit/import report shapes.
- Create: `tests/services/graph/test_validator.py`
  - Cover orphan-edge rejection, enrichment warning behavior, and mild sanitization rules.
- Create: `tests/services/graph/test_pipeline.py`
  - Cover normalization, backbone extraction, enrichment merge, and backbone-only degradation.
- Modify: `tests/api/routers/test_course_templates.py`
  - Assert import responses include import reports and that graph import rejects invalid node/edge payloads.
- Create: `web/tests/course-knowledge-graph.test.ts`
  - Cover frontend mapping of typed graph payloads into viewer-ready nodes and edges.

## Task 1: Define typed course knowledge graph models

**Files:**
- Modify: `deeptutor/services/graph/models.py`
- Modify: `tests/services/graph/test_models.py`

- [ ] **Step 1: Write the failing model validation test**

```python
from pydantic import ValidationError

from deeptutor.services.graph.models import CourseKnowledgeGraph


def test_course_knowledge_graph_rejects_unknown_relation_type() -> None:
    payload = {
        "course_id": "intro-ai",
        "title": "Intro to AI",
        "source_type": "syllabus_pdf",
        "source_summary": "Week-by-week syllabus",
        "import_version": "v1",
        "nodes": [
            {
                "node_id": "topic_intro",
                "title": "Introduction to AI",
                "node_type": "topic",
                "description": "Overview of the course scope.",
                "difficulty": "easy",
                "learning_outcomes": ["Describe the scope of AI"],
                "examples": ["Classifying images"],
                "related_questions": ["What is AI?"],
                "resources": [],
                "source_refs": [{"section_title": "Week 1", "snippet": "Introduction to AI"}],
            }
        ],
        "edges": [
            {
                "edge_id": "edge_1",
                "source": "topic_intro",
                "target": "topic_ethics",
                "relation_type": "depends_on",
                "confidence": 0.9,
                "rationale": "Suggested by the model",
                "source_refs": [],
            }
        ],
        "audit": {
            "backbone_node_ids": ["topic_intro"],
            "enriched_node_ids": [],
            "backbone_edge_ids": [],
            "enriched_edge_ids": ["edge_1"],
            "warnings": [],
        },
    }

    try:
        CourseKnowledgeGraph.model_validate(payload)
    except ValidationError as exc:
        assert "depends_on" in str(exc)
    else:
        raise AssertionError("Expected validation error for unsupported relation_type")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/graph/test_models.py::test_course_knowledge_graph_rejects_unknown_relation_type -v`
Expected: FAIL with `ImportError` or attribute error because `CourseKnowledgeGraph` does not exist yet.

- [ ] **Step 3: Write minimal typed graph models**

```python
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


NodeType = Literal["topic", "concept", "skill", "application"]
RelationType = Literal[
    "prerequisite",
    "builds_skill",
    "applies_to",
    "example_of",
    "part_of",
    "related_to",
]
Difficulty = Literal["easy", "medium", "hard"]


class SourceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_title: str = ""
    snippet: str = ""


class GraphResource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    kind: Literal["reading", "video", "exercise", "reference"] = "reference"
    url: str = ""


class KnowledgeGraphNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str
    title: str
    node_type: NodeType
    description: str = ""
    difficulty: Difficulty = "medium"
    learning_outcomes: list[str] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)
    related_questions: list[str] = Field(default_factory=list)
    resources: list[GraphResource] = Field(default_factory=list)
    source_refs: list[SourceRef] = Field(default_factory=list)


class KnowledgeGraphEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    edge_id: str
    source: str
    target: str
    relation_type: RelationType
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = ""
    source_refs: list[SourceRef] = Field(default_factory=list)


class GraphAudit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    backbone_node_ids: list[str] = Field(default_factory=list)
    enriched_node_ids: list[str] = Field(default_factory=list)
    backbone_edge_ids: list[str] = Field(default_factory=list)
    enriched_edge_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ImportReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["backbone_only", "enriched"]
    topic_node_count: int = 0
    enrichment_node_count: int = 0
    edge_count: int = 0
    cross_link_count: int = 0
    warning_count: int = 0


class CourseKnowledgeGraph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: str
    title: str
    source_type: Literal["syllabus_pdf", "syllabus_text", "manual_json"]
    source_summary: str = ""
    import_version: str = "v1"
    nodes: list[KnowledgeGraphNode] = Field(default_factory=list)
    edges: list[KnowledgeGraphEdge] = Field(default_factory=list)
    audit: GraphAudit
    import_report: ImportReport | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/services/graph/test_models.py::test_course_knowledge_graph_rejects_unknown_relation_type -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/models.py tests/services/graph/test_models.py
git commit -m "feat: add typed course knowledge graph models"
```

## Task 2: Validate graph payloads and sanitize mild issues

**Files:**
- Create: `deeptutor/services/graph/validator.py`
- Create: `tests/services/graph/test_validator.py`

- [ ] **Step 1: Write the failing validator test**

```python
import pytest

from deeptutor.services.graph.validator import validate_course_knowledge_graph


def test_validate_course_knowledge_graph_rejects_orphan_edges() -> None:
    payload = {
        "course_id": "intro-ai",
        "title": "Intro to AI",
        "source_type": "manual_json",
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
                "source_refs": [],
            }
        ],
        "edges": [
            {
                "edge_id": "edge_1",
                "source": "topic_intro",
                "target": "missing_node",
                "relation_type": "prerequisite",
                "confidence": 1.0,
                "rationale": "Week order",
                "source_refs": [],
            }
        ],
        "audit": {
            "backbone_node_ids": ["topic_intro"],
            "enriched_node_ids": [],
            "backbone_edge_ids": ["edge_1"],
            "enriched_edge_ids": [],
            "warnings": [],
        },
    }

    with pytest.raises(ValueError, match="missing_node"):
        validate_course_knowledge_graph(payload)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/graph/test_validator.py::test_validate_course_knowledge_graph_rejects_orphan_edges -v`
Expected: FAIL with `ModuleNotFoundError` because the validator module does not exist yet.

- [ ] **Step 3: Implement minimal validation and sanitization**

```python
from __future__ import annotations

from deeptutor.services.graph.models import CourseKnowledgeGraph


def validate_course_knowledge_graph(payload: dict) -> CourseKnowledgeGraph:
    graph = CourseKnowledgeGraph.model_validate(payload)
    node_ids = {node.node_id for node in graph.nodes}

    for edge in graph.edges:
        if edge.source not in node_ids:
            raise ValueError(f"Unknown edge source: {edge.source}")
        if edge.target not in node_ids:
            raise ValueError(f"Unknown edge target: {edge.target}")

    seen_edges: set[str] = set()
    sanitized_edges = []
    for edge in graph.edges:
        if edge.edge_id in seen_edges:
            graph.audit.warnings.append(f"Duplicate edge dropped: {edge.edge_id}")
            continue
        seen_edges.add(edge.edge_id)
        sanitized_edges.append(edge)

    graph.edges = sanitized_edges
    if graph.import_report is not None:
        graph.import_report.warning_count = len(graph.audit.warnings)
        graph.import_report.edge_count = len(graph.edges)
    return graph
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/services/graph/test_validator.py::test_validate_course_knowledge_graph_rejects_orphan_edges -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/validator.py tests/services/graph/test_validator.py
git commit -m "feat: validate imported course knowledge graphs"
```

## Task 3: Normalize syllabus text into a structured backbone input

**Files:**
- Create: `deeptutor/services/graph/normalizer.py`
- Create: `tests/services/graph/test_pipeline.py`

- [ ] **Step 1: Write the failing normalization test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/graph/test_pipeline.py::test_normalize_syllabus_text_groups_lines_into_sections -v`
Expected: FAIL with `ModuleNotFoundError` because `normalizer.py` does not exist yet.

- [ ] **Step 3: Implement minimal syllabus normalization**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/services/graph/test_pipeline.py::test_normalize_syllabus_text_groups_lines_into_sections -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/normalizer.py tests/services/graph/test_pipeline.py
git commit -m "feat: normalize syllabus text for graph import"
```

## Task 4: Build a staged import pipeline with backbone-first extraction and controlled enrichment

**Files:**
- Create: `deeptutor/services/graph/prompts.py`
- Create: `deeptutor/services/graph/pipeline.py`
- Modify: `tests/services/graph/test_pipeline.py`

- [ ] **Step 1: Write the failing pipeline degradation test**

```python
from deeptutor.services.graph.pipeline import build_course_knowledge_graph


class StubLlm:
    def __init__(self, responses: list[str]) -> None:
        self._responses = responses

    async def complete(self, prompt: str) -> str:
        return self._responses.pop(0)


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/graph/test_pipeline.py::test_build_course_knowledge_graph_falls_back_to_backbone_only -v`
Expected: FAIL with import error because the pipeline does not exist yet.

- [ ] **Step 3: Implement minimal staged pipeline**

In `deeptutor/services/graph/prompts.py`:

```python
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
```

In `deeptutor/services/graph/pipeline.py`:

```python
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

    payload = {
        "course_id": course_id,
        "title": title,
        "source_type": source_type,
        "source_summary": normalized.source_summary,
        "import_version": "v1",
        "nodes": backbone_data["nodes"],
        "edges": backbone_data.get("edges", []),
        "audit": GraphAudit(
            backbone_node_ids=[node["node_id"] for node in backbone_data["nodes"]],
            enriched_node_ids=[],
            backbone_edge_ids=[edge["edge_id"] for edge in backbone_data.get("edges", [])],
            enriched_edge_ids=[],
            warnings=[],
        ).model_dump(),
        "import_report": ImportReport(
            status="backbone_only",
            topic_node_count=sum(1 for node in backbone_data["nodes"] if node["node_type"] == "topic"),
            enrichment_node_count=0,
            edge_count=len(backbone_data.get("edges", [])),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/services/graph/test_pipeline.py::test_build_course_knowledge_graph_falls_back_to_backbone_only -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/prompts.py deeptutor/services/graph/pipeline.py tests/services/graph/test_pipeline.py
git commit -m "feat: add staged course knowledge graph import pipeline"
```

## Task 5: Route PDF extraction and JSON import through the validated graph pipeline

**Files:**
- Modify: `deeptutor/api/routers/course_templates.py`
- Modify: `tests/api/routers/test_course_templates.py`

- [ ] **Step 1: Write the failing API response test**

```python
from fastapi.testclient import TestClient


def test_import_course_template_returns_import_report(client: TestClient) -> None:
    payload = {
        "course_id": "test-course-import-knowledge-1",
        "title": "Intro to AI",
        "source_type": "manual_json",
        "source_summary": "2 sections",
        "import_version": "v1",
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
                "source_refs": [],
            }
        ],
        "edges": [],
        "audit": {
            "backbone_node_ids": ["topic_intro"],
            "enriched_node_ids": [],
            "backbone_edge_ids": [],
            "enriched_edge_ids": [],
            "warnings": [],
        },
        "import_report": {
            "status": "backbone_only",
            "topic_node_count": 1,
            "enrichment_node_count": 0,
            "edge_count": 0,
            "cross_link_count": 0,
            "warning_count": 0,
        },
    }

    response = client.post("/api/v1/course-templates/import", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["course_id"] == "test-course-import-knowledge-1"
    assert data["import_report"]["status"] == "backbone_only"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/api/routers/test_course_templates.py::test_import_course_template_returns_import_report -v`
Expected: FAIL because the route currently returns only `{"course_id": ...}`.

- [ ] **Step 3: Implement route-level validation and richer responses**

```python
from deeptutor.services.graph.pipeline import build_course_knowledge_graph
from deeptutor.services.graph.validator import validate_course_knowledge_graph


def _slugify_course_id(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-") or "course"


@router.post("/course-templates/import")
async def import_course_template(payload: Dict[str, Any], store: SQLiteSessionStore = Depends(get_sqlite_session_store)):
    course_id = payload.get("course_id")
    session_id = payload.get("session_id")
    graph = validate_course_knowledge_graph(payload)
    await store.upsert_course_template(course_id, graph.model_dump_json())
    if session_id:
        updated = await store.update_session_preferences(session_id, {"course_id": course_id})
        if not updated:
            raise HTTPException(status_code=404, detail="Session not found")
    return {
        "course_id": course_id,
        "import_report": graph.import_report.model_dump() if graph.import_report else None,
    }


@router.post("/course-templates/extract-pdf")
async def extract_course_template_from_pdf(file: UploadFile = File(...), store: SQLiteSessionStore = Depends(get_sqlite_session_store)):
    text = ""
    with pdfplumber.open(file.file) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    generated_slug = _slugify_course_id(file.filename.rsplit(".", 1)[0])
    graph = await build_course_knowledge_graph(
        source_type="syllabus_pdf",
        course_id=f"{generated_slug}-{str(uuid.uuid4())[:6]}",
        title=file.filename.rsplit(".", 1)[0],
        source_text=text,
        llm=get_llm_client(),
    )
    await store.upsert_course_template(graph.course_id, graph.model_dump_json())
    return {
        "course_id": graph.course_id,
        "import_report": graph.import_report.model_dump() if graph.import_report else None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/api/routers/test_course_templates.py -v`
Expected: PASS, including the existing session preference test plus the new import-report assertion.

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/course_templates.py tests/api/routers/test_course_templates.py
git commit -m "feat: validate and report course knowledge graph imports"
```

## Task 6: Preserve storage compatibility for richer graph payloads

**Files:**
- Modify: `deeptutor/services/session/sqlite_store.py`
- Modify: `tests/services/session/test_sqlite_store.py`

- [ ] **Step 1: Write the failing persistence test**

```python
import asyncio
import json

from deeptutor.services.session.sqlite_store import get_sqlite_session_store


def test_course_template_round_trips_import_report() -> None:
    store = get_sqlite_session_store()
    payload = {
        "course_id": "course-storage-1",
        "title": "Stored Graph",
        "source_type": "manual_json",
        "source_summary": "1 section",
        "import_version": "v1",
        "nodes": [],
        "edges": [],
        "audit": {
            "backbone_node_ids": [],
            "enriched_node_ids": [],
            "backbone_edge_ids": [],
            "enriched_edge_ids": [],
            "warnings": [],
        },
        "import_report": {
            "status": "backbone_only",
            "topic_node_count": 0,
            "enrichment_node_count": 0,
            "edge_count": 0,
            "cross_link_count": 0,
            "warning_count": 0,
        },
    }

    asyncio.run(store.upsert_course_template(payload["course_id"], json.dumps(payload)))
    stored = asyncio.run(store.get_course_template(payload["course_id"]))

    assert stored is not None
    assert "backbone_only" in stored["template_json"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py::test_course_template_round_trips_import_report -v`
Expected: FAIL because the richer graph payload round-trip is not covered yet.

- [ ] **Step 3: Make persistence helpers explicit about graph templates**

```python
async def upsert_course_template(self, subject_id: str, template_json: str) -> bool:
    return await self._run(self._upsert_course_template_sync, subject_id, template_json)


async def get_course_template(self, subject_id: str) -> dict[str, Any] | None:
    return await self._run(self._get_course_template_sync, subject_id)
```

Keep the first implementation slice explicit and non-branching:

```python
# Persist the full validated graph, including audit and import_report,
# inside template_json. Do not add a new SQLite column in this slice.
await store.upsert_course_template(graph.course_id, graph.model_dump_json())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/session/test_sqlite_store.py::test_course_template_round_trips_import_report -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/session/sqlite_store.py tests/services/session/test_sqlite_store.py
git commit -m "test: cover course knowledge graph template persistence"
```

## Task 7: Keep the workspace graph viewer compatible with the richer payload

**Files:**
- Create: `web/lib/course-knowledge-graph.ts`
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Create: `web/tests/course-knowledge-graph.test.ts`

- [ ] **Step 1: Write the failing frontend mapping test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { mapCourseKnowledgeGraphToFlow } from "../lib/course-knowledge-graph.ts";

test("mapCourseKnowledgeGraphToFlow preserves relation labels and node styling hints", () => {
  const flow = mapCourseKnowledgeGraphToFlow({
    course_id: "intro-ai",
    title: "Intro to AI",
    source_type: "manual_json",
    nodes: [
      {
        node_id: "topic_intro",
        title: "Introduction to AI",
        node_type: "topic",
        description: "Overview",
        difficulty: "easy",
        learning_outcomes: [],
        examples: [],
        related_questions: [],
        resources: [],
        source_refs: [],
      },
      {
        node_id: "concept_search",
        title: "Search Space",
        node_type: "concept",
        description: "State-space view",
        difficulty: "medium",
        learning_outcomes: [],
        examples: [],
        related_questions: [],
        resources: [],
        source_refs: [],
      },
    ],
    edges: [
      {
        edge_id: "edge_1",
        source: "topic_intro",
        target: "concept_search",
        relation_type: "part_of",
        confidence: 1,
        rationale: "Appears in week outline",
        source_refs: [],
      },
    ],
    audit: {
      backbone_node_ids: ["topic_intro"],
      enriched_node_ids: ["concept_search"],
      backbone_edge_ids: ["edge_1"],
      enriched_edge_ids: [],
      warnings: [],
    },
  });

  assert.equal(flow.nodes[0].data.label, "Introduction to AI");
  assert.equal(flow.edges[0].label, "part_of");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts`
Expected: FAIL with module resolution error because the mapping helper does not exist yet.

- [ ] **Step 3: Implement shared mapping helper and wire it into the viewer**

```ts
export function mapCourseKnowledgeGraphToFlow(graph: CourseKnowledgeGraph) {
  const nodes = graph.nodes.map((node, index) => ({
    id: node.node_id,
    position: {
      x: node.node_type === "topic" ? 250 : 520,
      y: 60 + index * 120,
    },
    data: {
      label: node.title,
      nodeType: node.node_type,
      difficulty: node.difficulty,
    },
    type: "default",
  }));

  const edges = graph.edges.map((edge) => ({
    id: edge.edge_id,
    source: edge.source,
    target: edge.target,
    label: edge.relation_type,
    animated: edge.relation_type === "related_to",
  }));

  return { nodes, edges };
}
```

Then in `KnowledgeGraphViewer.tsx`, replace the inline `applyCourseTemplate` body with the shared helper:

```ts
const flow = mapCourseKnowledgeGraphToFlow(data);
setNodes(flow.nodes);
setEdges(flow.edges);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/knowledge-graph-course.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/course-knowledge-graph.ts web/components/graph/KnowledgeGraphViewer.tsx web/tests/course-knowledge-graph.test.ts
git commit -m "feat: support richer course knowledge graph payloads in viewer"
```

## Task 8: Run focused regression suites and record compatibility expectations

**Files:**
- No new files; verification only.

- [ ] **Step 1: Run the backend graph and API regression suite**

Run: `.venv/bin/python -m pytest tests/services/graph/test_models.py tests/services/graph/test_validator.py tests/services/graph/test_pipeline.py tests/api/routers/test_course_templates.py tests/services/session/test_sqlite_store.py -v`
Expected: PASS

- [ ] **Step 2: Run the frontend compatibility suite**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/knowledge-graph-course.test.ts`
Expected: PASS

- [ ] **Step 3: Manually verify one import flow**

Run:

```bash
python -m deeptutor.api.run_server
```

Then import one known-good JSON graph through the workspace and confirm:
- the API returns an `import_report`
- the session still stores `preferences.course_id`
- the left-pane graph renders labels for richer nodes without crashing

- [ ] **Step 4: Record any real deviations in the branch notes or issue tracker**

```md
- If the viewer needs a dedicated node card for metadata, capture that as a follow-up plan rather than expanding this one.
```

- [ ] **Step 5: Commit the verified implementation branch**

```bash
git status --short
git add deeptutor/api/routers/course_templates.py deeptutor/services/graph/models.py deeptutor/services/graph/normalizer.py deeptutor/services/graph/pipeline.py deeptutor/services/graph/prompts.py deeptutor/services/graph/validator.py deeptutor/services/session/sqlite_store.py tests/api/routers/test_course_templates.py tests/services/graph/test_models.py tests/services/graph/test_pipeline.py tests/services/graph/test_validator.py tests/services/session/test_sqlite_store.py web/components/graph/KnowledgeGraphViewer.tsx web/lib/course-knowledge-graph.ts web/tests/course-knowledge-graph.test.ts
git commit -m "feat: upgrade syllabus import to course knowledge graph pipeline"
```
