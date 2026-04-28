# Graph QA and Prerequisite Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic graph QA, prerequisite edge authoring, safe bulk fixes, and adaptive gate integration for course Knowledge Graphs.

**Architecture:** Keep graph QA as a deterministic backend domain service that analyzes one course graph plus its audit metadata and emits typed issues, suggested fixes, and gate state. Persist the latest QA report and draft fix set in SQLite, expose them through a dedicated FastAPI router, then layer instructor-facing Graph Health UI and inline graph issue editing on top of the existing Knowledge Graph viewer. Adaptive recommendation should consume the gate state instead of inferring graph trustworthiness itself.

**Tech Stack:** Python, FastAPI, Pydantic, SQLite session store, pytest, TypeScript, React/Next.js, `@xyflow/react`, Node test runner

---

## File Structure

### Backend graph QA domain

- Modify: `deeptutor/services/graph/models.py`
  - Add typed QA report, issue, fix, gate, and draft-change models
- Create: `deeptutor/services/graph/qa.py`
  - Deterministic analyzer for graph health, issue generation, fix suggestion generation, and gate resolution
- Create: `deeptutor/services/graph/qa_authoring.py`
  - Apply single fixes and draft fix batches into a graph template
- Create: `tests/services/graph/test_qa.py`
  - Unit coverage for issue detection, fix planning, and authoring mutations

### Backend persistence and API

- Modify: `deeptutor/services/session/sqlite_store.py`
  - Persist latest QA reports, draft change sets, and gate state by course
- Create: `deeptutor/api/routers/graph_qa.py`
  - Analyze, read report, apply fix, manage draft, and read gate routes
- Modify: `deeptutor/api/main.py`
  - Register the Graph QA router
- Modify: `deeptutor/api/routers/graph_recommendation.py`
  - Read adaptive gate state before serving recommendations
- Create: `tests/api/routers/test_graph_qa.py`
  - API coverage for QA routes and draft workflow
- Modify: `tests/api/routers/test_graph_recommendation.py`
  - Recommendation behavior when adaptive mode is blocked or limited
- Modify: `tests/services/session/test_sqlite_store.py`
  - Persistence coverage for QA report, gate state, and draft changes

### Frontend Graph Health and authoring

- Create: `web/lib/graph-qa-api.ts`
  - Typed fetch helpers for QA report, fix apply, draft actions, and gate state
- Modify: `web/lib/course-knowledge-graph.ts`
  - Carry issue severity, suspicious edge styling, and adaptive status hints into flow mapping
- Create: `web/lib/graph-qa-ui.ts`
  - Format severity labels, gate copy, and fix preview copy
- Create: `web/components/graph/GraphHealthPanel.tsx`
  - Instructor-focused QA summary, issue list, suggested fixes, and draft review UI
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - Load QA state, render Graph Health, focus issues, style nodes and edges, apply fixes, and re-analyze
- Modify: `web/components/graph/NodeDetailPanel.tsx`
  - Show node-level QA issues and quick prerequisite edit actions
- Create: `web/tests/graph-qa-ui.test.ts`
  - Formatter coverage and Graph Health copy expectations
- Modify: `web/tests/course-knowledge-graph.test.ts`
  - Mapping coverage for issue styling and gate hints

## Task 1: Add typed Graph QA models

**Files:**
- Modify: `deeptutor/services/graph/models.py`
- Create: `tests/services/graph/test_qa.py`

- [ ] **Step 1: Write the failing model validation tests**

```python
from deeptutor.services.graph.models import GraphQaReport, GraphQaIssue, GraphQaSuggestedFix


def test_graph_qa_report_defaults_nested_lists() -> None:
    report = GraphQaReport.model_validate(
        {
            "course_id": "intro-ai",
            "health_summary": {
                "score": 82,
                "adaptive_ready": False,
                "critical_count": 0,
                "high_count": 1,
                "medium_count": 0,
                "low_count": 0,
            },
            "gate_status": {
                "status": "adaptive_limited",
                "blocking_issue_ids": [],
                "student_visible_message": "Adaptive guidance is available with limitations.",
                "instructor_message": "Resolve high-priority graph issues to improve adaptive reliability.",
            },
        }
    )

    assert report.course_id == "intro-ai"
    assert report.issues == []
    assert report.suggested_fixes == []


def test_graph_qa_issue_and_fix_literals_validate() -> None:
    issue = GraphQaIssue.model_validate(
        {
            "issue_id": "issue_1",
            "severity": "high",
            "kind": "suspect_part_of_should_be_prerequisite",
            "message": "Edge edge_intro_search appears to encode a dependency.",
            "affected_node_ids": ["topic_intro", "topic_search"],
            "affected_edge_ids": ["edge_intro_search"],
            "why_it_matters": "Adaptive progression may unlock topic_search too early.",
        }
    )
    fix = GraphQaSuggestedFix.model_validate(
        {
            "fix_id": "fix_1",
            "issue_id": "issue_1",
            "confidence": 0.92,
            "change_type": "change_relation_type",
            "preview": {
                "edge_id": "edge_intro_search",
                "before": {"relation_type": "part_of"},
                "after": {"relation_type": "prerequisite"},
            },
            "safe_for_bulk_apply": True,
        }
    )

    assert issue.severity == "high"
    assert fix.change_type == "change_relation_type"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_qa.py::test_graph_qa_report_defaults_nested_lists tests/services/graph/test_qa.py::test_graph_qa_issue_and_fix_literals_validate -v`
Expected: FAIL with `ImportError` or `AttributeError` because the QA models do not exist yet.

- [ ] **Step 3: Add minimal QA model types**

```python
GraphQaSeverity = Literal["critical", "high", "medium", "low"]
GraphQaIssueKind = Literal[
    "prerequisite_cycle",
    "backbone_path_broken",
    "unreachable_core_node",
    "suspect_part_of_should_be_prerequisite",
    "missing_prerequisite_edge",
    "redundant_prerequisite_edge",
    "orphan_node",
    "inconsistent_module_flow",
]
GraphQaFixChangeType = Literal[
    "change_relation_type",
    "add_prerequisite_edge",
    "remove_prerequisite_edge",
]
GraphAdaptiveGateStatus = Literal["adaptive_ready", "adaptive_limited", "adaptive_blocked"]


class GraphQaHealthSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(ge=0, le=100)
    adaptive_ready: bool = False
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0


class GraphQaIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issue_id: str
    severity: GraphQaSeverity
    kind: GraphQaIssueKind
    message: str
    affected_node_ids: list[str] = Field(default_factory=list)
    affected_edge_ids: list[str] = Field(default_factory=list)
    why_it_matters: str = ""


class GraphQaSuggestedFix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fix_id: str
    issue_id: str
    confidence: float = Field(ge=0.0, le=1.0)
    change_type: GraphQaFixChangeType
    preview: dict[str, object] = Field(default_factory=dict)
    safe_for_bulk_apply: bool = False


class GraphQaGateStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: GraphAdaptiveGateStatus
    blocking_issue_ids: list[str] = Field(default_factory=list)
    student_visible_message: str = ""
    instructor_message: str = ""


class GraphQaReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: str
    health_summary: GraphQaHealthSummary
    issues: list[GraphQaIssue] = Field(default_factory=list)
    suggested_fixes: list[GraphQaSuggestedFix] = Field(default_factory=list)
    gate_status: GraphQaGateStatus
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/services/graph/test_qa.py::test_graph_qa_report_defaults_nested_lists tests/services/graph/test_qa.py::test_graph_qa_issue_and_fix_literals_validate -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/models.py tests/services/graph/test_qa.py
git commit -m "feat: add graph QA models"
```

## Task 2: Implement the deterministic QA analyzer and fix planner

**Files:**
- Create: `deeptutor/services/graph/qa.py`
- Modify: `tests/services/graph/test_qa.py`

- [ ] **Step 1: Write the failing analyzer tests**

```python
from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.qa import analyze_course_graph


def build_graph_with_suspect_part_of() -> CourseKnowledgeGraph:
    return CourseKnowledgeGraph.model_validate(
        {
            "course_id": "intro-ai",
            "title": "Intro to AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "topic_intro", "title": "Introduction to AI", "node_type": "topic"},
                {"node_id": "topic_search", "title": "AI Search Techniques", "node_type": "topic"},
            ],
            "edges": [
                {
                    "edge_id": "edge_intro_search",
                    "source": "topic_intro",
                    "target": "topic_search",
                    "relation_type": "part_of",
                    "confidence": 1.0,
                }
            ],
            "audit": {
                "backbone_node_ids": ["topic_intro", "topic_search"],
                "enriched_node_ids": [],
                "backbone_edge_ids": ["edge_intro_search"],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )


def test_analyze_course_graph_flags_suspect_part_of_edge() -> None:
    report = analyze_course_graph(build_graph_with_suspect_part_of())

    assert report.health_summary.high_count == 1
    assert report.gate_status.status == "adaptive_limited"
    assert report.issues[0].kind == "suspect_part_of_should_be_prerequisite"
    assert report.suggested_fixes[0].change_type == "change_relation_type"


def test_analyze_course_graph_blocks_cycles() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "cycle-ai",
            "title": "Cycle AI",
            "source_type": "manual_json",
            "nodes": [
                {"node_id": "a", "title": "A", "node_type": "topic"},
                {"node_id": "b", "title": "B", "node_type": "topic"},
            ],
            "edges": [
                {"edge_id": "edge_ab", "source": "a", "target": "b", "relation_type": "prerequisite", "confidence": 1.0},
                {"edge_id": "edge_ba", "source": "b", "target": "a", "relation_type": "prerequisite", "confidence": 1.0},
            ],
            "audit": {
                "backbone_node_ids": ["a", "b"],
                "enriched_node_ids": [],
                "backbone_edge_ids": ["edge_ab", "edge_ba"],
                "enriched_edge_ids": [],
                "warnings": [],
            },
        }
    )

    report = analyze_course_graph(graph)

    assert report.health_summary.critical_count == 1
    assert report.gate_status.status == "adaptive_blocked"
    assert report.issues[0].kind == "prerequisite_cycle"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_qa.py::test_analyze_course_graph_flags_suspect_part_of_edge tests/services/graph/test_qa.py::test_analyze_course_graph_blocks_cycles -v`
Expected: FAIL with `ImportError` because `analyze_course_graph` does not exist yet.

- [ ] **Step 3: Implement the minimal analyzer and fix planner**

```python
from __future__ import annotations

from collections import defaultdict

from deeptutor.services.graph.models import (
    CourseKnowledgeGraph,
    GraphQaGateStatus,
    GraphQaHealthSummary,
    GraphQaIssue,
    GraphQaReport,
    GraphQaSuggestedFix,
)


def analyze_course_graph(graph: CourseKnowledgeGraph) -> GraphQaReport:
    issues: list[GraphQaIssue] = []
    fixes: list[GraphQaSuggestedFix] = []

    prerequisite_edges = [edge for edge in graph.edges if edge.relation_type == "prerequisite"]
    outgoing: dict[str, set[str]] = defaultdict(set)
    incoming: dict[str, set[str]] = defaultdict(set)
    for edge in prerequisite_edges:
        outgoing[edge.source].add(edge.target)
        incoming[edge.target].add(edge.source)

    if _contains_cycle(outgoing, {node.node_id for node in graph.nodes}):
        issues.append(
            GraphQaIssue(
                issue_id="issue_cycle",
                severity="critical",
                kind="prerequisite_cycle",
                message="The prerequisite graph contains a cycle.",
                affected_node_ids=sorted({node.node_id for node in graph.nodes}),
                why_it_matters="Students cannot progress through a cyclic prerequisite chain.",
            )
        )

    for edge in graph.edges:
        if edge.relation_type != "part_of":
            continue
        if edge.source in graph.audit.backbone_node_ids and edge.target in graph.audit.backbone_node_ids:
            issue_id = f"issue_{edge.edge_id}"
            issues.append(
                GraphQaIssue(
                    issue_id=issue_id,
                    severity="high",
                    kind="suspect_part_of_should_be_prerequisite",
                    message=f"Edge {edge.edge_id} appears to encode a dependency.",
                    affected_node_ids=[edge.source, edge.target],
                    affected_edge_ids=[edge.edge_id],
                    why_it_matters="Adaptive progression may unlock the downstream topic too early.",
                )
            )
            fixes.append(
                GraphQaSuggestedFix(
                    fix_id=f"fix_{edge.edge_id}",
                    issue_id=issue_id,
                    confidence=0.9,
                    change_type="change_relation_type",
                    preview={
                        "edge_id": edge.edge_id,
                        "before": {"relation_type": edge.relation_type},
                        "after": {"relation_type": "prerequisite"},
                    },
                    safe_for_bulk_apply=True,
                )
            )

    critical_count = sum(1 for issue in issues if issue.severity == "critical")
    high_count = sum(1 for issue in issues if issue.severity == "high")
    medium_count = sum(1 for issue in issues if issue.severity == "medium")
    low_count = sum(1 for issue in issues if issue.severity == "low")
    status = "adaptive_blocked" if critical_count else "adaptive_limited" if issues else "adaptive_ready"

    return GraphQaReport(
        course_id=graph.course_id,
        health_summary=GraphQaHealthSummary(
            score=max(0, 100 - critical_count * 40 - high_count * 15 - medium_count * 8 - low_count * 3),
            adaptive_ready=status != "adaptive_blocked",
            critical_count=critical_count,
            high_count=high_count,
            medium_count=medium_count,
            low_count=low_count,
        ),
        issues=issues,
        suggested_fixes=fixes,
        gate_status=GraphQaGateStatus(
            status=status,
            blocking_issue_ids=[issue.issue_id for issue in issues if issue.severity == "critical"],
            student_visible_message="Adaptive guidance is blocked until prerequisite issues are resolved." if critical_count else "",
            instructor_message="Resolve critical graph issues to enable adaptive mode." if critical_count else "",
        ),
    )
```

- [ ] **Step 4: Run the QA unit tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_qa.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/qa.py tests/services/graph/test_qa.py
git commit -m "feat: analyze graph QA issues and suggested fixes"
```

## Task 3: Implement graph fix application and draft staging persistence

**Files:**
- Create: `deeptutor/services/graph/qa_authoring.py`
- Modify: `deeptutor/services/session/sqlite_store.py`
- Modify: `tests/services/graph/test_qa.py`
- Modify: `tests/services/session/test_sqlite_store.py`

- [ ] **Step 1: Write the failing authoring and persistence tests**

```python
from deeptutor.services.graph.qa_authoring import apply_graph_fix


def test_apply_graph_fix_changes_relation_type() -> None:
    graph = build_graph_with_suspect_part_of()
    updated = apply_graph_fix(graph, {
        "change_type": "change_relation_type",
        "preview": {
            "edge_id": "edge_intro_search",
            "after": {"relation_type": "prerequisite"},
        },
    })

    edge = next(edge for edge in updated.edges if edge.edge_id == "edge_intro_search")
    assert edge.relation_type == "prerequisite"


def test_store_persists_graph_qa_report_and_draft(store: SQLiteSessionStore) -> None:
    report = {
        "course_id": "intro-ai",
        "health_summary": {
            "score": 90,
            "adaptive_ready": True,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
        },
        "issues": [],
        "suggested_fixes": [],
        "gate_status": {
            "status": "adaptive_ready",
            "blocking_issue_ids": [],
            "student_visible_message": "",
            "instructor_message": "",
        },
    }
    draft = {
        "course_id": "intro-ai",
        "changes": [
            {
                "change_id": "change_1",
                "fix_id": "fix_edge_intro_search",
                "change_type": "change_relation_type",
                "preview": {"edge_id": "edge_intro_search"},
            }
        ],
    }

    assert asyncio.run(store.save_graph_qa_report("intro-ai", report)) is True
    assert asyncio.run(store.save_graph_qa_draft("intro-ai", draft)) is True
    assert asyncio.run(store.get_graph_qa_report("intro-ai"))["course_id"] == "intro-ai"
    assert asyncio.run(store.get_graph_qa_draft("intro-ai"))["changes"][0]["fix_id"] == "fix_edge_intro_search"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/services/graph/test_qa.py::test_apply_graph_fix_changes_relation_type tests/services/session/test_sqlite_store.py::test_store_persists_graph_qa_report_and_draft -v`
Expected: FAIL with missing `apply_graph_fix`, `save_graph_qa_report`, or `save_graph_qa_draft`.

- [ ] **Step 3: Implement fix application and SQLite helpers**

```python
def apply_graph_fix(graph: CourseKnowledgeGraph, fix: dict[str, object]) -> CourseKnowledgeGraph:
    payload = graph.model_dump()
    edge_id = str((fix.get("preview") or {}).get("edge_id", ""))
    change_type = str(fix.get("change_type", ""))

    if change_type == "change_relation_type":
        new_relation = str(((fix.get("preview") or {}).get("after") or {}).get("relation_type", ""))
        for edge in payload["edges"]:
            if edge.get("edge_id") == edge_id:
                edge["relation_type"] = new_relation
                break

    return CourseKnowledgeGraph.model_validate(payload)
```

```python
CREATE TABLE IF NOT EXISTS graph_qa_reports (
    subject_id TEXT PRIMARY KEY REFERENCES course_graph_templates(subject_id) ON DELETE CASCADE,
    report_json TEXT NOT NULL DEFAULT '{}',
    analyzed_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_qa_drafts (
    subject_id TEXT PRIMARY KEY REFERENCES course_graph_templates(subject_id) ON DELETE CASCADE,
    draft_json TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_adaptive_gates (
    subject_id TEXT PRIMARY KEY REFERENCES course_graph_templates(subject_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'adaptive_ready',
    blocking_issue_ids_json TEXT NOT NULL DEFAULT '[]',
    updated_at REAL NOT NULL
);
```

```python
async def save_graph_qa_report(self, subject_id: str, report: dict[str, Any]) -> bool:
    return await self._run(self._save_graph_qa_report_sync, subject_id, report)

async def get_graph_qa_report(self, subject_id: str) -> dict[str, Any] | None:
    return await self._run(self._get_graph_qa_report_sync, subject_id)

async def save_graph_qa_draft(self, subject_id: str, draft: dict[str, Any]) -> bool:
    return await self._run(self._save_graph_qa_draft_sync, subject_id, draft)

async def get_graph_qa_draft(self, subject_id: str) -> dict[str, Any] | None:
    return await self._run(self._get_graph_qa_draft_sync, subject_id)
```

- [ ] **Step 4: Run the targeted persistence tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_qa.py::test_apply_graph_fix_changes_relation_type tests/services/session/test_sqlite_store.py::test_store_persists_graph_qa_report_and_draft -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/services/graph/qa_authoring.py deeptutor/services/session/sqlite_store.py tests/services/graph/test_qa.py tests/services/session/test_sqlite_store.py
git commit -m "feat: persist graph QA reports and draft changes"
```

## Task 4: Add Graph QA API routes

**Files:**
- Create: `deeptutor/api/routers/graph_qa.py`
- Modify: `deeptutor/api/main.py`
- Create: `tests/api/routers/test_graph_qa.py`

- [ ] **Step 1: Write the failing API tests**

```python
def test_analyze_graph_qa_returns_report(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.upsert_course_template(
            "intro-ai",
            json.dumps(build_graph_with_suspect_part_of().model_dump()),
        )
    )

    with TestClient(_build_app(store)) as client:
        response = client.post("/api/v1/graph/qa/analyze/intro-ai")
        assert response.status_code == 200
        body = response.json()
        assert body["course_id"] == "intro-ai"
        assert body["health_summary"]["high_count"] == 1
        assert body["suggested_fixes"][0]["change_type"] == "change_relation_type"


def test_graph_qa_draft_commit_reanalyzes(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.upsert_course_template(
            "intro-ai",
            json.dumps(build_graph_with_suspect_part_of().model_dump()),
        )
    )

    with TestClient(_build_app(store)) as client:
        client.post("/api/v1/graph/qa/analyze/intro-ai")
        stage = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/draft",
            json={"fix_ids": ["fix_edge_intro_search"]},
        )
        assert stage.status_code == 200

        commit = client.post("/api/v1/graph/qa/draft/intro-ai/commit")
        assert commit.status_code == 200
        assert commit.json()["gate_status"]["status"] == "adaptive_ready"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/routers/test_graph_qa.py -v`
Expected: FAIL because the Graph QA router does not exist yet.

- [ ] **Step 3: Implement the router and register it**

```python
router = APIRouter()


@router.post("/qa/analyze/{course_id}")
async def analyze_graph_qa(course_id: str):
    store = get_sqlite_session_store()
    graph = await store.get_course_template(course_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Course graph not found")
    report = analyze_course_graph(CourseKnowledgeGraph.model_validate(graph))
    await store.save_graph_qa_report(course_id, report.model_dump())
    await store.save_graph_adaptive_gate(
        course_id,
        {
            "status": report.gate_status.status,
            "blocking_issue_ids": report.gate_status.blocking_issue_ids,
        },
    )
    return report.model_dump()
```

```python
@router.get("/qa/{course_id}")
async def get_graph_qa_report(course_id: str):
    report = await get_sqlite_session_store().get_graph_qa_report(course_id)
    if not report:
        raise HTTPException(status_code=404, detail="Graph QA report not found")
    return report


@router.post("/qa/fixes/{course_id}/apply")
async def apply_graph_qa_fix(course_id: str, payload: FixApplyPayload):
    store = get_sqlite_session_store()
    graph = CourseKnowledgeGraph.model_validate(await store.get_course_template(course_id))
    report = GraphQaReport.model_validate(await store.get_graph_qa_report(course_id))
    fix = next(item for item in report.suggested_fixes if item.fix_id == payload.fix_id)
    updated_graph = apply_graph_fix(graph, fix.model_dump())
    await store.upsert_course_template(course_id, json.dumps(updated_graph.model_dump(), ensure_ascii=False))
    updated_report = analyze_course_graph(updated_graph)
    await store.save_graph_qa_report(course_id, updated_report.model_dump())
    await store.save_graph_adaptive_gate(course_id, updated_report.gate_status.model_dump())
    return updated_report.model_dump()


@router.post("/qa/fixes/{course_id}/draft")
async def stage_graph_qa_fixes(course_id: str, payload: FixDraftPayload):
    store = get_sqlite_session_store()
    report = GraphQaReport.model_validate(await store.get_graph_qa_report(course_id))
    staged = [
        {
            "change_id": f"change_{fix.fix_id}",
            "fix_id": fix.fix_id,
            "change_type": fix.change_type,
            "preview": fix.preview,
        }
        for fix in report.suggested_fixes
        if fix.fix_id in payload.fix_ids and fix.safe_for_bulk_apply
    ]
    draft = {"course_id": course_id, "changes": staged}
    await store.save_graph_qa_draft(course_id, draft)
    return draft


@router.post("/qa/draft/{course_id}/commit")
async def commit_graph_qa_draft(course_id: str):
    store = get_sqlite_session_store()
    draft = await store.get_graph_qa_draft(course_id)
    graph = CourseKnowledgeGraph.model_validate(await store.get_course_template(course_id))
    updated_graph = graph
    for change in draft.get("changes", []):
        updated_graph = apply_graph_fix(
            updated_graph,
            {
                "change_type": change["change_type"],
                "preview": change["preview"],
            },
        )
    await store.upsert_course_template(course_id, json.dumps(updated_graph.model_dump(), ensure_ascii=False))
    updated_report = analyze_course_graph(updated_graph)
    await store.save_graph_qa_report(course_id, updated_report.model_dump())
    await store.save_graph_adaptive_gate(course_id, updated_report.gate_status.model_dump())
    await store.save_graph_qa_draft(course_id, {"course_id": course_id, "changes": []})
    return updated_report.model_dump()
```

```python
app.include_router(graph_qa.router, prefix="/api/v1/graph", tags=["graph-qa"])
```

- [ ] **Step 4: Run the router tests**

Run: `.venv/bin/python -m pytest tests/api/routers/test_graph_qa.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/graph_qa.py deeptutor/api/main.py tests/api/routers/test_graph_qa.py
git commit -m "feat: expose graph QA and draft authoring routes"
```

## Task 5: Integrate adaptive gate status into recommendation

**Files:**
- Modify: `deeptutor/api/routers/graph_recommendation.py`
- Modify: `tests/api/routers/test_graph_recommendation.py`

- [ ] **Step 1: Write the failing recommendation gate tests**

```python
def test_graph_recommendation_returns_blocked_state_when_gate_is_blocked(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.save_graph_adaptive_gate(
            "intro-ai",
            {
                "status": "adaptive_blocked",
                "blocking_issue_ids": ["issue_cycle"],
            },
        )
    )

    with TestClient(_build_app(store)) as client:
        response = client.get("/api/v1/graph/recommendation/intro-ai?session_id=session_1")
        assert response.status_code == 200
        assert response.json()["recommended_node_id"] == ""
        assert response.json()["mode"] == "review"
        assert response.json()["reason_codes"] == ["needs_review_before_advance"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tests/api/routers/test_graph_recommendation.py::test_graph_recommendation_returns_blocked_state_when_gate_is_blocked -v`
Expected: FAIL because the router currently ignores adaptive gate state.

- [ ] **Step 3: Add gate-aware recommendation fallback**

```python
gate = await store.get_graph_adaptive_gate(course_id)
if gate and gate.get("status") == "adaptive_blocked":
    return {
        "recommended_node_id": "",
        "mode": "review",
        "score": 0.0,
        "reason_codes": ["needs_review_before_advance"],
        "backup_node_ids": [],
        "gate_status": gate,
    }
```

- [ ] **Step 4: Run recommendation API tests**

Run: `.venv/bin/python -m pytest tests/api/routers/test_graph_recommendation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/graph_recommendation.py tests/api/routers/test_graph_recommendation.py
git commit -m "feat: gate graph recommendations on QA status"
```

## Task 6: Add frontend Graph QA API and mapping helpers

**Files:**
- Create: `web/lib/graph-qa-api.ts`
- Create: `web/lib/graph-qa-ui.ts`
- Modify: `web/lib/course-knowledge-graph.ts`
- Create: `web/tests/graph-qa-ui.test.ts`
- Modify: `web/tests/course-knowledge-graph.test.ts`

- [ ] **Step 1: Write the failing frontend helper tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { describeAdaptiveGateStatus } from "../lib/graph-qa-ui.ts";
import { mapCourseKnowledgeGraphToFlow } from "../lib/course-knowledge-graph.ts";

test("describeAdaptiveGateStatus formats blocked copy", () => {
  assert.equal(
    describeAdaptiveGateStatus("adaptive_blocked"),
    "Adaptive guidance is blocked until critical graph issues are resolved.",
  );
});

test("mapCourseKnowledgeGraphToFlow marks nodes with issue severity metadata", () => {
  const flow = mapCourseKnowledgeGraphToFlow(
    {
      course_id: "intro-ai",
      title: "Intro to AI",
      source_type: "manual_json",
      nodes: [{ node_id: "topic_intro", title: "Intro", node_type: "topic" }],
      edges: [],
      audit: { backbone_node_ids: [], enriched_node_ids: [], backbone_edge_ids: [], enriched_edge_ids: [], warnings: [] },
    },
    {
      issuesByNodeId: {
        topic_intro: [{ severity: "high", kind: "orphan_node" }],
      },
    },
  );

  assert.equal(flow.nodes[0]?.data?.issueSeverity, "high");
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/graph-qa-ui.test.ts web/tests/course-knowledge-graph.test.ts`
Expected: FAIL because the Graph QA frontend helpers do not exist yet.

- [ ] **Step 3: Add the API client, formatter, and mapping metadata**

```ts
export interface GraphQaIssue {
  issue_id: string;
  severity: "critical" | "high" | "medium" | "low";
  kind: string;
  message: string;
  affected_node_ids: string[];
  affected_edge_ids: string[];
  why_it_matters: string;
}

export interface GraphQaReport {
  course_id: string;
  health_summary: {
    score: number;
    adaptive_ready: boolean;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
  };
  issues: GraphQaIssue[];
  suggested_fixes: GraphQaSuggestedFix[];
  gate_status: {
    status: "adaptive_ready" | "adaptive_limited" | "adaptive_blocked";
    blocking_issue_ids: string[];
    student_visible_message: string;
    instructor_message: string;
  };
}
```

```ts
export function describeAdaptiveGateStatus(status: GraphQaReport["gate_status"]["status"]): string {
  if (status === "adaptive_blocked") {
    return "Adaptive guidance is blocked until critical graph issues are resolved.";
  }
  if (status === "adaptive_limited") {
    return "Adaptive guidance is available, but the graph still has quality issues.";
  }
  return "Adaptive guidance is ready.";
}
```

```ts
data: {
  label: node.title,
  description: node.description ?? "",
  nodeType: node.node_type,
  difficulty: node.difficulty ?? "medium",
  issueSeverity,
  issueCount: nodeIssues.length,
}
```

- [ ] **Step 4: Run the frontend helper tests**

Run: `node --experimental-strip-types --test web/tests/graph-qa-ui.test.ts web/tests/course-knowledge-graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/lib/graph-qa-api.ts web/lib/graph-qa-ui.ts web/lib/course-knowledge-graph.ts web/tests/graph-qa-ui.test.ts web/tests/course-knowledge-graph.test.ts
git commit -m "feat: add frontend graph QA helpers and flow metadata"
```

## Task 7: Build Graph Health panel and inline issue rendering

**Files:**
- Create: `web/components/graph/GraphHealthPanel.tsx`
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/NodeDetailPanel.tsx`

- [ ] **Step 1: Write the failing UI-state tests**

```ts
test("GraphHealthPanel groups issues by severity", () => {
  const grouped = groupGraphQaIssues([
    { issue_id: "issue_1", severity: "critical", kind: "prerequisite_cycle", message: "Cycle", affected_node_ids: [], affected_edge_ids: [], why_it_matters: "" },
    { issue_id: "issue_2", severity: "high", kind: "orphan_node", message: "Orphan", affected_node_ids: [], affected_edge_ids: [], why_it_matters: "" },
  ]);

  assert.equal(grouped.critical.length, 1);
  assert.equal(grouped.high.length, 1);
});
```

- [ ] **Step 2: Run the UI-state tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/graph-qa-ui.test.ts`
Expected: FAIL because `groupGraphQaIssues` and the panel helpers do not exist yet.

- [ ] **Step 3: Add the Graph Health panel and viewer integration**

```tsx
export default function GraphHealthPanel({
  report,
  draft,
  onAnalyze,
  onFocusIssue,
  onApplyFix,
  onStageSafeFixes,
}: GraphHealthPanelProps) {
  const grouped = groupGraphQaIssues(report?.issues ?? []);

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Graph Health</h2>
      <p className="mt-1 text-sm text-slate-600">
        {describeAdaptiveGateStatus(report?.gate_status.status ?? "adaptive_ready")}
      </p>
      <button onClick={onAnalyze}>Analyze Graph</button>
      <section>
        {(["critical", "high", "medium", "low"] as const).map((severity) => (
          <div key={severity}>
            <h3>{severity}</h3>
            {(grouped[severity] ?? []).map((issue) => (
              <button key={issue.issue_id} onClick={() => onFocusIssue(issue)}>
                {issue.message}
              </button>
            ))}
          </div>
        ))}
      </section>
    </aside>
  );
}
```

```tsx
const [qaReport, setQaReport] = useState<GraphQaReport | null>(null);
const [qaDraft, setQaDraft] = useState<GraphQaDraft | null>(null);

useEffect(() => {
  if (!courseId) return;
  void getGraphQaReport(courseId).then(setQaReport).catch(() => setQaReport(null));
  void getGraphQaDraft(courseId).then(setQaDraft).catch(() => setQaDraft(null));
}, [courseId]);
```

```tsx
<GraphHealthPanel
  report={qaReport}
  draft={qaDraft}
  onAnalyze={handleAnalyzeGraph}
  onFocusIssue={handleFocusIssue}
  onApplyFix={handleApplyFix}
  onStageSafeFixes={handleStageSafeFixes}
/>
```

- [ ] **Step 4: Run the relevant frontend tests**

Run: `node --experimental-strip-types --test web/tests/graph-qa-ui.test.ts web/tests/course-knowledge-graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/components/graph/GraphHealthPanel.tsx web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx web/tests/graph-qa-ui.test.ts
git commit -m "feat: add graph health panel and inline QA rendering"
```

## Task 8: Add single-fix apply, draft workflow, and end-to-end adaptive refresh

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/NodeDetailPanel.tsx`
- Modify: `web/lib/graph-qa-api.ts`
- Modify: `tests/api/routers/test_graph_qa.py`
- Modify: `web/tests/graph-qa-ui.test.ts`

- [ ] **Step 1: Write the failing draft workflow tests**

```python
def test_graph_qa_apply_fix_clears_high_issue(store: SQLiteSessionStore) -> None:
    asyncio.run(
        store.upsert_course_template(
            "intro-ai",
            json.dumps(build_graph_with_suspect_part_of().model_dump()),
        )
    )

    with TestClient(_build_app(store)) as client:
        client.post("/api/v1/graph/qa/analyze/intro-ai")
        response = client.post(
            "/api/v1/graph/qa/fixes/intro-ai/apply",
            json={"fix_id": "fix_edge_intro_search"},
        )
        assert response.status_code == 200
        assert response.json()["health_summary"]["high_count"] == 0
        assert response.json()["gate_status"]["status"] == "adaptive_ready"
```

```ts
test("collectSafeBulkFixIds only returns safe fixes", () => {
  const result = collectSafeBulkFixIds([
    { fix_id: "fix_1", safe_for_bulk_apply: true },
    { fix_id: "fix_2", safe_for_bulk_apply: false },
  ] as Array<{ fix_id: string; safe_for_bulk_apply: boolean }>);

  assert.deepEqual(result, ["fix_1"]);
});
```

- [ ] **Step 2: Run the draft workflow tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/api/routers/test_graph_qa.py::test_graph_qa_apply_fix_clears_high_issue -v`
Run: `node --experimental-strip-types --test web/tests/graph-qa-ui.test.ts`
Expected: FAIL because single-fix apply and safe bulk helpers are not complete yet.

- [ ] **Step 3: Complete the authoring loop in API and UI**

```ts
export async function applyGraphQaFix(courseId: string, fixId: string): Promise<GraphQaReport> {
  const response = await fetch(apiUrl(`/api/v1/graph/qa/fixes/${courseId}/apply`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fix_id: fixId }),
  });
  return expectJson<GraphQaReport>(response);
}
```

```tsx
const handleApplyFix = useCallback(async (fixId: string) => {
  if (!courseId) return;
  const report = await applyGraphQaFix(courseId, fixId);
  setQaReport(report);
  applyCourseTemplate(graphTemplate, progressMap, { currentNodeId, dynamicNodes }, recommendation?.recommended_node_id);
  if (sessionId) {
    await refreshRecommendation(courseId);
  }
}, [applyCourseTemplate, courseId, currentNodeId, dynamicNodes, graphTemplate, progressMap, recommendation?.recommended_node_id, refreshRecommendation, sessionId]);
```

```python
@router.post("/qa/fixes/{course_id}/apply")
async def apply_graph_qa_fix(course_id: str, payload: FixApplyPayload):
    graph_payload = await store.get_course_template(course_id)
    report = GraphQaReport.model_validate(await store.get_graph_qa_report(course_id))
    fix = next(fix for fix in report.suggested_fixes if fix.fix_id == payload.fix_id)
    updated_graph = apply_graph_fix(CourseKnowledgeGraph.model_validate(graph_payload), fix.model_dump())
    await store.upsert_course_template(course_id, json.dumps(updated_graph.model_dump()))
    next_report = analyze_course_graph(updated_graph)
    await store.save_graph_qa_report(course_id, next_report.model_dump())
    await store.save_graph_adaptive_gate(course_id, next_report.gate_status.model_dump())
    return next_report.model_dump()
```

- [ ] **Step 4: Run the end-to-end QA tests**

Run: `.venv/bin/python -m pytest tests/services/graph/test_qa.py tests/services/session/test_sqlite_store.py tests/api/routers/test_graph_qa.py tests/api/routers/test_graph_recommendation.py -q`
Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/graph-qa-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/graph_qa.py deeptutor/services/graph/qa_authoring.py web/lib/graph-qa-api.ts web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx tests/api/routers/test_graph_qa.py web/tests/graph-qa-ui.test.ts
git commit -m "feat: complete graph QA authoring workflow"
```
