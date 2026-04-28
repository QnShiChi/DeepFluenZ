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
RecommendationMode = Literal["advance", "review", "remediate"]
RecommendationReasonCode = Literal[
    "prerequisites_ready",
    "high_unlock_value",
    "close_to_current_path",
    "recent_quiz_weakness",
    "needs_review_before_advance",
]
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


class GraphRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommended_node_id: str
    mode: RecommendationMode
    score: float = Field(ge=0.0, le=1.0)
    reason_codes: list[RecommendationReasonCode] = Field(default_factory=list)
    backup_node_ids: list[str] = Field(default_factory=list)


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
