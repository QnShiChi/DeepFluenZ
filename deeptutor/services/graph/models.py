from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class NodeType(Enum):
    MAIN = "MAIN"
    SIDE_QUEST = "SIDE_QUEST"


@dataclass
class KnowledgeNode:
    node_id: str
    title: str
    node_type: NodeType
    dependencies: list[str] = field(default_factory=list)


@dataclass
class CourseGraphTemplate:
    course_id: str
    nodes: list[KnowledgeNode] = field(default_factory=list)


@dataclass
class StudentGraphState:
    student_id: str
    current_node_id: str
    mastered_nodes: list[str] = field(default_factory=list)
    dynamic_nodes: list[KnowledgeNode] = field(default_factory=list)


GraphNodeType = Literal["topic", "concept", "skill", "application"]
RelationType = Literal[
    "prerequisite",
    "builds_skill",
    "applies_to",
    "example_of",
    "part_of",
    "related_to",
]
Difficulty = Literal["easy", "medium", "hard"]
SourceType = Literal["syllabus_pdf", "syllabus_text", "manual_json"]
ImportStatus = Literal["backbone_only", "enriched"]
ResourceKind = Literal["reading", "video", "exercise", "reference"]


class SourceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_title: str = ""
    snippet: str = ""


class GraphResource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    kind: ResourceKind = "reference"
    url: str = ""


class KnowledgeGraphNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    node_id: str
    title: str
    node_type: GraphNodeType
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

    status: ImportStatus
    topic_node_count: int = 0
    enrichment_node_count: int = 0
    edge_count: int = 0
    cross_link_count: int = 0
    warning_count: int = 0


class CourseKnowledgeGraph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: str
    title: str
    source_type: SourceType
    source_summary: str = ""
    import_version: str = "v1"
    nodes: list[KnowledgeGraphNode] = Field(default_factory=list)
    edges: list[KnowledgeGraphEdge] = Field(default_factory=list)
    audit: GraphAudit
    import_report: ImportReport | None = None
