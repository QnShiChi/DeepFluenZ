# Hierarchical Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild DeepTutor's Knowledge Graph as a hierarchical, cluster-friendly graph that preserves syllabus structure, reveals child concepts, supports expand/collapse and drag layout, and remains compatible with existing adaptive flows.

**Architecture:** The implementation is split into three streams that can be landed incrementally: backend graph schema and generation, frontend rendering and layout, and compatibility updates for recommendation/remediation/review logic. The first milestone changes the graph data model and generator while keeping the current viewer alive through a compatibility layer; later milestones add cluster rendering and persisted layout override.

**Tech Stack:** Python, Pydantic, FastAPI routers, existing graph services in `deeptutor/services/graph/`, React, TypeScript, `@xyflow/react`, Node test runner, Pytest

---

## File Structure

### Backend graph schema and generation

- Modify: `deeptutor/services/graph/models.py`
  - Add hierarchical node metadata and explicit `contains` semantics.
- Modify: `deeptutor/services/graph/pipeline.py`
  - Split graph generation into structure extraction, local enrichment, and normalization helpers.
- Modify: `deeptutor/services/graph/prompts.py`
  - Tighten extraction/enrichment prompts so they preserve syllabus numbering and generate bounded child concepts.
- Modify: `deeptutor/services/graph/qa_authoring.py`
  - Preserve hierarchy metadata when QA fix flows round-trip the graph.
- Modify: `deeptutor/services/graph/recommendation.py`
  - Ensure adaptive decisions ignore `contains` edges as gating edges.
- Modify: `deeptutor/services/graph/review.py`
  - Ensure review scoring uses learning edges only and tolerates child concept nodes.
- Create: `tests/services/graph/test_hierarchical_pipeline.py`
  - Covers `lesson -> subtopic -> concept` generation and normalization.
- Create: `tests/services/graph/test_hierarchical_adaptive_compatibility.py`
  - Covers recommendation/review behavior on graphs that include `contains`.

### Frontend graph contracts and layout

- Modify: `web/lib/course-knowledge-graph.ts`
  - Add hierarchical graph types, compatibility mapping, and cluster-aware flow conversion.
- Create: `web/lib/knowledge-graph-layout.ts`
  - Build overview and cluster layout helpers plus persisted override application.
- Modify: `web/lib/node-progress-api.ts`
  - Carry hierarchy-aware remediation and node metadata if needed by viewer actions.
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
  - Add overview/expanded modes, expand/collapse state, drag persistence, reset layout, and cluster rendering plumbing.
- Modify: `web/components/graph/NodeDetailPanel.tsx`
  - Show parent/child hierarchy context and child-count hints.
- Create: `web/tests/knowledge-graph-layout.test.ts`
  - Covers cluster placement and override behavior.
- Modify: `web/tests/course-knowledge-graph.test.ts`
  - Covers compatibility mapping and hierarchy-aware flow conversion.
- Create: `web/tests/knowledge-graph-viewer-clusters.test.tsx`
  - Covers expand/collapse, drag persistence, and reset layout UI behavior.

### Compatibility and contract safety

- Modify: `deeptutor/api/routers/course_templates.py`
  - Preserve hierarchical template payloads on import/export.
- Modify: `deeptutor/api/routers/graph_recommendation.py`
  - Continue to serve recommendations from hierarchical graphs without changing API shape.
- Modify: `web/lib/knowledge-graph-actions.ts`
  - Keep node actions and remediation payloads grounded when the selected node is a child subtopic or concept.
- Create: `web/tests/knowledge-graph-hierarchy-contract.test.ts`
  - Covers frontend parsing of hierarchical template payloads.

## Task 1: Add Hierarchical Graph Schema

**Files:**
- Modify: `deeptutor/services/graph/models.py`
- Test: `tests/services/graph/test_hierarchical_pipeline.py`

- [ ] **Step 1: Write the failing backend schema test**

```python
from deeptutor.services.graph.models import CourseKnowledgeGraph


def test_course_knowledge_graph_accepts_hierarchical_nodes_and_contains_edges() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "oop-java",
            "title": "OOP Java",
            "source_type": "syllabus",
            "nodes": [
                {
                    "node_id": "lesson-3",
                    "title": "Bài 3: Giới thiệu về Java",
                    "description": "Tổng quan nền tảng Java.",
                    "node_type": "lesson",
                    "hierarchy_level": 0,
                    "source_label": "Bài 3",
                    "source_path": ["Bài 3"],
                    "ordinal": "3",
                },
                {
                    "node_id": "subtopic-3-2",
                    "title": "3.2 Cấu trúc chương trình Java",
                    "description": "Cấu trúc class và hàm main.",
                    "node_type": "subtopic",
                    "hierarchy_level": 1,
                    "parent_node_id": "lesson-3",
                    "source_label": "3.2",
                    "source_path": ["Bài 3", "3.2"],
                    "ordinal": "3.2",
                },
            ],
            "edges": [
                {
                    "edge_id": "contains-lesson-3-subtopic-3-2",
                    "source": "lesson-3",
                    "target": "subtopic-3-2",
                    "relation_type": "contains",
                    "confidence": 1.0,
                }
            ],
            "audit": {
                "backbone_node_ids": ["lesson-3"],
                "enriched_node_ids": ["subtopic-3-2"],
                "backbone_edge_ids": [],
                "enriched_edge_ids": ["contains-lesson-3-subtopic-3-2"],
                "warnings": [],
            },
        }
    )

    assert graph.nodes[0].node_type == "lesson"
    assert graph.nodes[1].parent_node_id == "lesson-3"
    assert graph.edges[0].relation_type == "contains"
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_pipeline.py::test_course_knowledge_graph_accepts_hierarchical_nodes_and_contains_edges -v`

Expected: FAIL with a validation error because `lesson`, `subtopic`, `hierarchy_level`, or `parent_node_id` are not supported yet.

- [ ] **Step 3: Add minimal hierarchical model support**

```python
# deeptutor/services/graph/models.py

GraphNodeType = Literal[
    "topic",
    "concept",
    "skill",
    "application",
    "lesson",
    "subtopic",
]

GraphRelationType = Literal[
    "prerequisite",
    "part_of",
    "contains",
    "related_to",
]


class KnowledgeGraphNode(BaseModel):
    node_id: str
    title: str
    description: str = ""
    node_type: GraphNodeType
    difficulty: str = "medium"
    hierarchy_level: int = 0
    parent_node_id: str = ""
    ordinal: str = ""
    source_label: str = ""
    source_path: list[str] = Field(default_factory=list)
    layout_group_id: str = ""
    layout_priority: int = 0
```

- [ ] **Step 4: Run the schema test to verify it passes**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_pipeline.py::test_course_knowledge_graph_accepts_hierarchical_nodes_and_contains_edges -v`

Expected: PASS

- [ ] **Step 5: Commit the schema change**

```bash
git add deeptutor/services/graph/models.py tests/services/graph/test_hierarchical_pipeline.py
git commit -m "feat: add hierarchical knowledge graph schema"
```

## Task 2: Preserve Lesson/Subtopic Structure From Syllabus

**Files:**
- Modify: `deeptutor/services/graph/pipeline.py`
- Modify: `deeptutor/services/graph/prompts.py`
- Test: `tests/services/graph/test_hierarchical_pipeline.py`

- [ ] **Step 1: Write the failing structure extraction test**

```python
from deeptutor.services.graph.pipeline import merge_course_graph_layers


def test_merge_course_graph_layers_preserves_numbered_lesson_hierarchy() -> None:
    backbone = {
        "course_id": "oop-java",
        "title": "Lập trình hướng đối tượng",
        "source_type": "syllabus",
        "nodes": [
            {"node_id": "lesson-1", "title": "Bài 1: Giới thiệu về OOP", "description": "", "node_type": "lesson", "ordinal": "1"},
            {"node_id": "subtopic-1-1", "title": "1.1 Một số khái niệm", "description": "", "node_type": "subtopic", "parent_node_id": "lesson-1", "ordinal": "1.1"},
            {"node_id": "subtopic-1-2", "title": "1.2 Ngôn ngữ hỗ trợ lập trình hướng đối tượng", "description": "", "node_type": "subtopic", "parent_node_id": "lesson-1", "ordinal": "1.2"},
        ],
        "edges": [
            {"edge_id": "contains-1-1", "source": "lesson-1", "target": "subtopic-1-1", "relation_type": "contains"},
            {"edge_id": "contains-1-2", "source": "lesson-1", "target": "subtopic-1-2", "relation_type": "contains"},
        ],
        "audit": {"backbone_node_ids": ["lesson-1"], "enriched_node_ids": [], "backbone_edge_ids": [], "enriched_edge_ids": [], "warnings": []},
    }
    enriched = {"nodes": [], "edges": []}

    graph = merge_course_graph_layers(backbone, enriched)

    children = sorted(node.title for node in graph.nodes if node.parent_node_id == "lesson-1")
    assert children == [
        "1.1 Một số khái niệm",
        "1.2 Ngôn ngữ hỗ trợ lập trình hướng đối tượng",
    ]
```

- [ ] **Step 2: Run the structure test to verify it fails**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_pipeline.py::test_merge_course_graph_layers_preserves_numbered_lesson_hierarchy -v`

Expected: FAIL because merge or sanitize helpers currently flatten node types and do not preserve parent-child hierarchy.

- [ ] **Step 3: Add structure-preserving pipeline helpers**

```python
# deeptutor/services/graph/pipeline.py

def _normalize_hierarchy_fields(raw_node: dict, *, index: int) -> dict:
    hierarchy_level = int(raw_node.get("hierarchy_level", 0) or 0)
    parent_node_id = str(raw_node.get("parent_node_id", "") or "").strip()
    ordinal = str(raw_node.get("ordinal", "") or "").strip()
    source_label = str(raw_node.get("source_label", ordinal) or ordinal).strip()
    source_path = [
        str(part).strip()
        for part in raw_node.get("source_path", []) or []
        if str(part).strip()
    ]
    return {
        "hierarchy_level": hierarchy_level,
        "parent_node_id": parent_node_id,
        "ordinal": ordinal,
        "source_label": source_label,
        "source_path": source_path,
        "layout_group_id": str(raw_node.get("layout_group_id", parent_node_id or raw_node.get("node_id", f"node-{index}")) or ""),
        "layout_priority": int(raw_node.get("layout_priority", 0) or 0),
    }


def _sanitize_node(raw_node: dict, *, index: int, default_node_type: str, default_id_prefix: str) -> dict:
    ...
    node = {
        "node_id": node_id,
        "title": title,
        "description": description,
        "node_type": node_type,
        "difficulty": difficulty,
    }
    node.update(_normalize_hierarchy_fields(raw_node, index=index))
    return node
```

- [ ] **Step 4: Tighten prompts so extraction preserves syllabus numbering**

```python
# deeptutor/services/graph/prompts.py

def build_backbone_extraction_prompt() -> str:
    return (
        "You are extracting the syllabus backbone for a course knowledge graph.\n"
        "- Preserve numbered hierarchy such as `Bài 3`, `3.1`, `3.2`, `3.3`.\n"
        "- Major rows like `Bài 3` must become `lesson` nodes.\n"
        "- Numbered children like `3.1`, `3.2` must become `subtopic` nodes with `parent_node_id` pointing to the lesson.\n"
        "- Emit `contains` edges for hierarchy and only use `prerequisite` when the syllabus clearly states dependency.\n"
    )
```

- [ ] **Step 5: Run the structure test to verify it passes**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_pipeline.py::test_merge_course_graph_layers_preserves_numbered_lesson_hierarchy -v`

Expected: PASS

- [ ] **Step 6: Commit the structure-preservation change**

```bash
git add deeptutor/services/graph/pipeline.py deeptutor/services/graph/prompts.py tests/services/graph/test_hierarchical_pipeline.py
git commit -m "feat: preserve syllabus hierarchy in graph pipeline"
```

## Task 3: Add Bounded Concept Enrichment Under The Right Parent

**Files:**
- Modify: `deeptutor/services/graph/pipeline.py`
- Modify: `deeptutor/services/graph/prompts.py`
- Test: `tests/services/graph/test_hierarchical_pipeline.py`

- [ ] **Step 1: Write the failing enrichment test**

```python
from deeptutor.services.graph.pipeline import merge_course_graph_layers


def test_merge_course_graph_layers_keeps_enriched_concepts_under_subtopic_parent() -> None:
    backbone = {
        "course_id": "oop-java",
        "title": "Lập trình hướng đối tượng",
        "source_type": "syllabus",
        "nodes": [
            {"node_id": "lesson-3", "title": "Bài 3: Giới thiệu về Java", "description": "", "node_type": "lesson"},
            {"node_id": "subtopic-3-2", "title": "3.2 Cấu trúc chương trình Java", "description": "", "node_type": "subtopic", "parent_node_id": "lesson-3"},
        ],
        "edges": [{"edge_id": "contains-3-2", "source": "lesson-3", "target": "subtopic-3-2", "relation_type": "contains"}],
        "audit": {"backbone_node_ids": ["lesson-3"], "enriched_node_ids": [], "backbone_edge_ids": [], "enriched_edge_ids": [], "warnings": []},
    }
    enriched = {
        "nodes": [
            {
                "node_id": "concept-main-method",
                "title": "Hàm main",
                "description": "Điểm bắt đầu thực thi chương trình Java.",
                "node_type": "concept",
                "parent_node_id": "subtopic-3-2",
                "hierarchy_level": 2,
            }
        ],
        "edges": [
            {"edge_id": "contains-main", "source": "subtopic-3-2", "target": "concept-main-method", "relation_type": "contains"}
        ],
    }

    graph = merge_course_graph_layers(backbone, enriched)

    concept = next(node for node in graph.nodes if node.node_id == "concept-main-method")
    assert concept.parent_node_id == "subtopic-3-2"
    assert concept.hierarchy_level == 2
```

- [ ] **Step 2: Run the enrichment test to verify it fails**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_pipeline.py::test_merge_course_graph_layers_keeps_enriched_concepts_under_subtopic_parent -v`

Expected: FAIL because enriched nodes are not normalized with parent metadata or are merged as flat concepts.

- [ ] **Step 3: Implement bounded local enrichment rules**

```python
# deeptutor/services/graph/pipeline.py

MAX_CHILD_CONCEPTS_PER_SUBTOPIC = 5


def _prune_enriched_children(nodes: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = {}
    for node in nodes:
        parent_id = str(node.get("parent_node_id", "") or "").strip()
        grouped.setdefault(parent_id, []).append(node)

    pruned: list[dict] = []
    for parent_id, group in grouped.items():
        ordered = sorted(
            group,
            key=lambda item: (
                int(item.get("layout_priority", 0) or 0),
                str(item.get("title", "") or ""),
            ),
        )
        pruned.extend(ordered[:MAX_CHILD_CONCEPTS_PER_SUBTOPIC])
    return pruned


def merge_course_graph_layers(backbone_data: dict, enrichment_data: dict) -> CourseKnowledgeGraph:
    ...
    enriched_nodes = _prune_enriched_children(
        _sanitize_nodes(
            enrichment_data.get("nodes", []),
            default_node_type="concept",
            default_id_prefix="concept",
        )
    )
    ...
```

- [ ] **Step 4: Tighten enrichment prompt for local child concepts**

```python
# deeptutor/services/graph/prompts.py

def build_enrichment_prompt() -> str:
    return (
        "You are enriching a syllabus backbone into a course knowledge graph.\n"
        "- For each lesson or subtopic, generate only a small number of high-value child nodes.\n"
        "- Child nodes must set `parent_node_id` to the lesson or subtopic they belong to.\n"
        "- Use `contains` for hierarchy and avoid inventing prerequisite edges unless the dependency is explicit and strong.\n"
        "- Prefer reusable concepts like `constructor`, `main method`, `encapsulation`, not trivial rephrasings of the parent title.\n"
    )
```

- [ ] **Step 5: Run the enrichment test to verify it passes**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_pipeline.py::test_merge_course_graph_layers_keeps_enriched_concepts_under_subtopic_parent -v`

Expected: PASS

- [ ] **Step 6: Commit the enrichment change**

```bash
git add deeptutor/services/graph/pipeline.py deeptutor/services/graph/prompts.py tests/services/graph/test_hierarchical_pipeline.py
git commit -m "feat: enrich hierarchical graph with bounded child concepts"
```

## Task 4: Keep Adaptive Logic Safe On Hierarchical Graphs

**Files:**
- Modify: `deeptutor/services/graph/recommendation.py`
- Modify: `deeptutor/services/graph/review.py`
- Modify: `deeptutor/services/graph/qa_authoring.py`
- Test: `tests/services/graph/test_hierarchical_adaptive_compatibility.py`

- [ ] **Step 1: Write the failing adaptive compatibility tests**

```python
from deeptutor.services.graph.models import CourseKnowledgeGraph
from deeptutor.services.graph.recommendation import recommend_next_graph_node


def test_recommendation_ignores_contains_edges_as_prerequisites() -> None:
    graph = CourseKnowledgeGraph.model_validate(
        {
            "course_id": "oop-java",
            "title": "OOP Java",
            "source_type": "syllabus",
            "nodes": [
                {"node_id": "lesson-3", "title": "Bài 3", "description": "", "node_type": "lesson"},
                {"node_id": "subtopic-3-1", "title": "3.1", "description": "", "node_type": "subtopic", "parent_node_id": "lesson-3"},
                {"node_id": "subtopic-4-1", "title": "4.1", "description": "", "node_type": "subtopic"},
            ],
            "edges": [
                {"edge_id": "contains-3-1", "source": "lesson-3", "target": "subtopic-3-1", "relation_type": "contains"},
                {"edge_id": "prereq-3-4", "source": "subtopic-3-1", "target": "subtopic-4-1", "relation_type": "prerequisite"},
            ],
            "audit": {"backbone_node_ids": [], "enriched_node_ids": [], "backbone_edge_ids": [], "enriched_edge_ids": [], "warnings": []},
        }
    )
    state = {"mastered_nodes": ["lesson-3", "subtopic-3-1"], "weak_node_ids": [], "active_remediation": None}

    recommendation = recommend_next_graph_node(graph=graph, student_state=state)

    assert recommendation.recommended_node_id == "subtopic-4-1"
```

- [ ] **Step 2: Run the adaptive tests to verify they fail**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_adaptive_compatibility.py -v`

Expected: FAIL because `contains` is either unsupported or leaks into prerequisite traversal.

- [ ] **Step 3: Update graph traversals to ignore hierarchy edges**

```python
# deeptutor/services/graph/recommendation.py

def _build_prerequisite_maps(graph: CourseKnowledgeGraph) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    prerequisites: dict[str, set[str]] = defaultdict(set)
    downstream: dict[str, set[str]] = defaultdict(set)
    for edge in graph.edges:
        if edge.relation_type != "prerequisite":
            continue
        prerequisites[edge.target].add(edge.source)
        downstream[edge.source].add(edge.target)
    return prerequisites, downstream
```

```python
# deeptutor/services/graph/review.py

downstream_blockers = [
    edge.target
    for edge in graph.edges
    if edge.relation_type == "prerequisite" and edge.source == node.node_id
]
```

- [ ] **Step 4: Preserve hierarchy fields during QA graph round-trip**

```python
# deeptutor/services/graph/qa_authoring.py

payload = graph.model_dump(mode="python")
payload["nodes"] = [
    {
        **node,
        "hierarchy_level": node.get("hierarchy_level", 0),
        "parent_node_id": node.get("parent_node_id", ""),
        "ordinal": node.get("ordinal", ""),
        "source_label": node.get("source_label", ""),
        "source_path": node.get("source_path", []),
    }
    for node in payload["nodes"]
]
return CourseKnowledgeGraph.model_validate(payload)
```

- [ ] **Step 5: Run the adaptive compatibility tests to verify they pass**

Run: `/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest tests/services/graph/test_hierarchical_adaptive_compatibility.py -v`

Expected: PASS

- [ ] **Step 6: Commit the adaptive compatibility change**

```bash
git add deeptutor/services/graph/recommendation.py deeptutor/services/graph/review.py deeptutor/services/graph/qa_authoring.py tests/services/graph/test_hierarchical_adaptive_compatibility.py
git commit -m "feat: keep adaptive graph logic compatible with hierarchy"
```

## Task 5: Add Frontend Hierarchy Contracts And Compatibility Mapping

**Files:**
- Modify: `web/lib/course-knowledge-graph.ts`
- Create: `web/tests/knowledge-graph-hierarchy-contract.test.ts`
- Modify: `web/tests/course-knowledge-graph.test.ts`

- [ ] **Step 1: Write the failing frontend contract tests**

```typescript
import test from "node:test";
import assert from "node:assert/strict";

import { mapCourseKnowledgeGraphToFlow } from "../lib/course-knowledge-graph.ts";

test("mapCourseKnowledgeGraphToFlow preserves child hierarchy metadata", () => {
  const flow = mapCourseKnowledgeGraphToFlow({
    course_id: "oop-java",
    title: "OOP Java",
    source_type: "syllabus",
    nodes: [
      {
        node_id: "lesson-3",
        title: "Bài 3: Giới thiệu về Java",
        description: "",
        node_type: "lesson",
        hierarchy_level: 0,
        source_label: "Bài 3",
        source_path: ["Bài 3"],
      },
      {
        node_id: "subtopic-3-2",
        title: "3.2 Cấu trúc chương trình Java",
        description: "",
        node_type: "subtopic",
        hierarchy_level: 1,
        parent_node_id: "lesson-3",
        source_label: "3.2",
        source_path: ["Bài 3", "3.2"],
      },
    ],
    edges: [
      { edge_id: "contains-3-2", source: "lesson-3", target: "subtopic-3-2", relation_type: "contains" },
    ],
    audit: {
      backbone_node_ids: ["lesson-3"],
      enriched_node_ids: ["subtopic-3-2"],
      backbone_edge_ids: [],
      enriched_edge_ids: ["contains-3-2"],
      warnings: [],
    },
  });

  const child = flow.nodes.find((node) => node.id === "subtopic-3-2");
  assert.equal(child?.data.parentNodeId, "lesson-3");
  assert.equal(child?.data.hierarchyLevel, 1);
});
```

- [ ] **Step 2: Run the frontend contract tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/knowledge-graph-hierarchy-contract.test.ts`

Expected: FAIL because `lesson`, `subtopic`, and hierarchy fields are not represented in the frontend mapper yet.

- [ ] **Step 3: Extend frontend graph types and compatibility mapper**

```typescript
// web/lib/course-knowledge-graph.ts

export interface CourseKnowledgeGraphNode {
  node_id?: string;
  title: string;
  node_type: "topic" | "concept" | "skill" | "application" | "lesson" | "subtopic";
  description?: string;
  difficulty?: string;
  hierarchy_level?: number;
  parent_node_id?: string;
  ordinal?: string;
  source_label?: string;
  source_path?: string[];
  layout_group_id?: string;
  layout_priority?: number;
}

...

      data: {
        label: node.title,
        description: node.description ?? "",
        nodeType: node.node_type,
        hierarchyLevel: node.hierarchy_level ?? 0,
        parentNodeId: node.parent_node_id ?? "",
        ordinal: node.ordinal ?? "",
        sourceLabel: node.source_label ?? "",
        sourcePath: node.source_path ?? [],
        layoutGroupId: node.layout_group_id ?? node.parent_node_id ?? id,
        difficulty: node.difficulty ?? "medium",
        ...
      },
```

- [ ] **Step 4: Run the frontend contract tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/course-knowledge-graph.test.ts web/tests/knowledge-graph-hierarchy-contract.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the frontend contract change**

```bash
git add web/lib/course-knowledge-graph.ts web/tests/course-knowledge-graph.test.ts web/tests/knowledge-graph-hierarchy-contract.test.ts
git commit -m "feat: add hierarchical graph contracts to web mapper"
```

## Task 6: Add Cluster Layout Helpers And Persisted Overrides

**Files:**
- Create: `web/lib/knowledge-graph-layout.ts`
- Create: `web/tests/knowledge-graph-layout.test.ts`

- [ ] **Step 1: Write the failing layout tests**

```typescript
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClusterLayout,
  applyLayoutOverrides,
} from "../lib/knowledge-graph-layout.ts";

test("buildClusterLayout places children around the parent cluster", () => {
  const layout = buildClusterLayout({
    parentId: "lesson-3",
    parentPosition: { x: 400, y: 200 },
    childIds: ["subtopic-3-1", "subtopic-3-2", "subtopic-3-3"],
    radius: 160,
  });

  assert.equal(layout["subtopic-3-1"].x !== 400, true);
  assert.equal(layout["subtopic-3-2"].y !== 200, true);
});

test("applyLayoutOverrides prefers manual positions when present", () => {
  const resolved = applyLayoutOverrides(
    {
      "lesson-3": { x: 250, y: 80 },
      "subtopic-3-2": { x: 420, y: 220 },
    },
    {
      "subtopic-3-2": { x: 600, y: 320 },
    },
  );

  assert.deepEqual(resolved["subtopic-3-2"], { x: 600, y: 320 });
});
```

- [ ] **Step 2: Run the layout tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-layout.test.ts`

Expected: FAIL because `knowledge-graph-layout.ts` does not exist yet.

- [ ] **Step 3: Create minimal cluster layout helpers**

```typescript
// web/lib/knowledge-graph-layout.ts

export interface GraphPoint {
  x: number;
  y: number;
}

export function buildClusterLayout(input: {
  parentId: string;
  parentPosition: GraphPoint;
  childIds: string[];
  radius: number;
}): Record<string, GraphPoint> {
  const positions: Record<string, GraphPoint> = {};
  const { childIds, parentPosition, radius } = input;
  childIds.forEach((childId, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(childIds.length, 1);
    positions[childId] = {
      x: parentPosition.x + Math.round(Math.cos(angle) * radius),
      y: parentPosition.y + Math.round(Math.sin(angle) * radius),
    };
  });
  return positions;
}

export function applyLayoutOverrides(
  base: Record<string, GraphPoint>,
  overrides: Record<string, GraphPoint>,
): Record<string, GraphPoint> {
  return { ...base, ...overrides };
}
```

- [ ] **Step 4: Run the layout tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-layout.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the layout helper change**

```bash
git add web/lib/knowledge-graph-layout.ts web/tests/knowledge-graph-layout.test.ts
git commit -m "feat: add hierarchical graph layout helpers"
```

## Task 7: Add Overview/Expanded Modes And Drag Persistence To The Viewer

**Files:**
- Modify: `web/components/graph/KnowledgeGraphViewer.tsx`
- Modify: `web/components/graph/NodeDetailPanel.tsx`
- Modify: `web/lib/node-progress-api.ts`
- Modify: `web/lib/knowledge-graph-actions.ts`
- Test: `web/tests/knowledge-graph-viewer-clusters.test.tsx`

- [ ] **Step 1: Write the failing viewer behavior tests**

```tsx
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";

import KnowledgeGraphViewer from "../components/graph/KnowledgeGraphViewer.tsx";

test("KnowledgeGraphViewer shows child subtopics after expanding a lesson cluster", async () => {
  render(<KnowledgeGraphViewer sessionId="session-1" />);

  const expandButton = await screen.findByRole("button", { name: /mở cụm/i });
  fireEvent.click(expandButton);

  assert.equal(await screen.findByText("3.2 Cấu trúc chương trình Java") instanceof HTMLElement, true);
});
```

- [ ] **Step 2: Run the viewer tests to verify they fail**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-viewer-clusters.test.tsx`

Expected: FAIL because the viewer does not expose cluster expansion controls or hierarchy-aware rendering yet.

- [ ] **Step 3: Add minimal hierarchy-aware viewer state**

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx

const [viewMode, setViewMode] = useState<"overview" | "expanded">("overview");
const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([]);
const [layoutOverrides, setLayoutOverrides] = useState<Record<string, { x: number; y: number }>>({});

const toggleCluster = useCallback((clusterId: string) => {
  setExpandedClusterIds((prev) =>
    prev.includes(clusterId) ? prev.filter((id) => id !== clusterId) : [...prev, clusterId]
  );
}, []);
```

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx

<button type="button" onClick={() => toggleCluster(selectedNode?.id || "")}>
  {expandedClusterIds.includes(selectedNode?.id || "") ? "Thu gọn cụm" : "Mở cụm"}
</button>
<button type="button" onClick={() => setLayoutOverrides({})}>
  Reset layout
</button>
```

- [ ] **Step 4: Wire drag persistence and child rendering through layout helpers**

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx

const handleNodeDragStop = useCallback((_event: unknown, node: Node) => {
  setLayoutOverrides((prev) => ({
    ...prev,
    [node.id]: { x: node.position.x, y: node.position.y },
  }));
}, []);

...

<ReactFlow
  nodes={nodes}
  edges={edges}
  onNodeClick={handleNodeClick}
  onNodeDragStop={handleNodeDragStop}
  fitView
>
```

```tsx
// web/components/graph/NodeDetailPanel.tsx

{node.parentNodeId ? (
  <div className="text-xs text-slate-500">
    Thuộc cụm: {node.parentNodeId}
  </div>
) : null}
```

- [ ] **Step 5: Run the viewer tests to verify they pass**

Run: `node --experimental-strip-types --test web/tests/knowledge-graph-viewer-clusters.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit the viewer change**

```bash
git add web/components/graph/KnowledgeGraphViewer.tsx web/components/graph/NodeDetailPanel.tsx web/lib/node-progress-api.ts web/lib/knowledge-graph-actions.ts web/tests/knowledge-graph-viewer-clusters.test.tsx
git commit -m "feat: add hierarchical graph cluster viewer"
```

## Task 8: Run Regression Verification For The Full Slice

**Files:**
- Test: `tests/services/graph/test_hierarchical_pipeline.py`
- Test: `tests/services/graph/test_hierarchical_adaptive_compatibility.py`
- Test: `web/tests/course-knowledge-graph.test.ts`
- Test: `web/tests/knowledge-graph-hierarchy-contract.test.ts`
- Test: `web/tests/knowledge-graph-layout.test.ts`
- Test: `web/tests/knowledge-graph-viewer-clusters.test.tsx`
- Test: `web/tests/graph-recommendation-ui.test.ts`
- Test: `web/tests/graph-review-state.test.ts`
- Test: `web/tests/knowledge-graph-actions.test.ts`

- [ ] **Step 1: Run the backend hierarchy suite**

```bash
/home/phan-duong-quoc-nhat/workspace/DeepTutor/.venv/bin/python -m pytest \
  tests/services/graph/test_hierarchical_pipeline.py \
  tests/services/graph/test_hierarchical_adaptive_compatibility.py \
  -q
```

Expected: all tests PASS

- [ ] **Step 2: Run the frontend hierarchy suite**

```bash
node --experimental-strip-types --test \
  web/tests/course-knowledge-graph.test.ts \
  web/tests/knowledge-graph-hierarchy-contract.test.ts \
  web/tests/knowledge-graph-layout.test.ts \
  web/tests/knowledge-graph-viewer-clusters.test.tsx
```

Expected: all tests PASS

- [ ] **Step 3: Run adaptive regression smoke tests**

```bash
node --experimental-strip-types --test \
  web/tests/graph-recommendation-ui.test.ts \
  web/tests/graph-review-state.test.ts \
  web/tests/knowledge-graph-actions.test.ts
```

Expected: all tests PASS

- [ ] **Step 4: Commit any last fixture or test-only adjustments**

```bash
git add tests/services/graph/test_hierarchical_pipeline.py \
  tests/services/graph/test_hierarchical_adaptive_compatibility.py \
  web/tests/course-knowledge-graph.test.ts \
  web/tests/knowledge-graph-hierarchy-contract.test.ts \
  web/tests/knowledge-graph-layout.test.ts \
  web/tests/knowledge-graph-viewer-clusters.test.tsx \
  web/tests/graph-recommendation-ui.test.ts \
  web/tests/graph-review-state.test.ts \
  web/tests/knowledge-graph-actions.test.ts
git commit -m "test: verify hierarchical knowledge graph rollout"
```

## Self-Review

### Spec coverage

- hierarchical schema and edge semantics: Task 1
- syllabus-first structure extraction: Task 2
- bounded local enrichment: Task 3
- adaptive compatibility and `contains` safety: Task 4
- frontend contracts and compatibility mapping: Task 5
- layout helpers and persisted overrides: Task 6
- overview/expanded viewer and drag behavior: Task 7
- regression safety across graph recommendation and remediation: Task 8

No spec section is currently uncovered.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to above” placeholders remain.
- Each task includes concrete file paths, code snippets, commands, expected outputs, and commit messages.

### Type consistency

- New node types are consistently named `lesson` and `subtopic`.
- Hierarchy metadata is consistently named `hierarchy_level`, `parent_node_id`, `ordinal`, `source_label`, `source_path`, `layout_group_id`, and `layout_priority`.
- New layout helper names are consistently `buildClusterLayout` and `applyLayoutOverrides`.

