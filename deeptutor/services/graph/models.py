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
GraphQuizFailureSeverity = Literal["mild", "moderate", "severe"]
GraphRemediationStatus = Literal[
    "recommended",
    "lesson_ready",
    "mini_quiz_ready",
    "passed_mini_quiz",
    "completed",
]
KnowledgeSignalType = Literal[
    "quiz_passed",
    "quiz_failed",
    "hint_requested",
    "retry_requested",
    "remediation_completed",
    "remediation_failed",
]
NextStepAction = Literal[
    "advance",
    "stay_and_explain",
    "give_micro_quiz",
    "start_targeted_remediation",
    "fallback_to_prerequisite",
]
NextStepReasonTag = Literal[
    "mastery_high",
    "mastery_uncertain",
    "recent_failure",
    "retry_loop_detected",
    "hint_dependence",
    "prerequisite_risk_high",
    "remediation_recovered",
    "ready_to_advance",
]
LearningTimelineCategory = Literal["node", "quiz", "remediation", "recommendation"]
LearningTimelineEventType = Literal[
    "node_started",
    "node_mastered",
    "quiz_failed",
    "quiz_passed",
    "remediation_recommended",
    "remediation_started",
    "remediation_mini_quiz_passed",
    "remediation_completed",
    "recommendation_changed",
]
LearningTimelineReasonTag = Literal[
    "prerequisite_ready",
    "recent_weakness",
    "retry_passed",
    "remediation_active",
    "remediation_cleared",
    "advanced_to_next",
    "manual_retry",
]
LearningTimelineActionKind = Literal[
    "focus_node",
    "open_node_detail",
    "retry_quiz",
    "start_remediation",
    "open_recommendation_target",
]


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
    critical_count: int = Field(default=0, ge=0)
    high_count: int = Field(default=0, ge=0)
    medium_count: int = Field(default=0, ge=0)
    low_count: int = Field(default=0, ge=0)


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


class ActiveGraphRemediation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_node_id: str
    target_node_id: str
    weak_concepts: list[str] = Field(default_factory=list)
    failure_severity: GraphQuizFailureSeverity
    status: GraphRemediationStatus
    attempt_count: int = 0
    last_node_quiz_score: float | None = None
    last_remediation_quiz_score: float | None = None


class GraphRemediationCacheEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cache_key: str
    target_node_id: str
    weak_concepts: list[str] = Field(default_factory=list)
    lesson_artifact: dict[str, object] = Field(default_factory=dict)
    mini_quiz_artifact: dict[str, object] = Field(default_factory=dict)
    created_at: str = ""


class NodeKnowledgeState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mastery_score: float = 0.0
    stuck_score: float = 0.0
    prerequisite_risk: float = 0.0
    confidence_score: float = 0.5
    attempt_count: int = 0
    hint_count: int = 0
    last_outcome: str = ""
    recent_signals: list[str] = Field(default_factory=list)
    last_interacted_at: str = ""


class KnowledgeSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal_type: KnowledgeSignalType
    node_id: str
    score_ratio: float | None = None
    metadata: dict[str, object] = Field(default_factory=dict)


class NextStepDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: NextStepAction
    target_node_id: str = ""
    reason_tags: list[NextStepReasonTag] = Field(default_factory=list)
    explanation_summary: str = ""
    recommended_difficulty: str = ""
    should_record_timeline: bool = True


class SessionKnowledgeState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    course_id: str
    active_node_id: str = ""
    nodes: dict[str, NodeKnowledgeState] = Field(default_factory=dict)
    last_policy_action: str = ""
    last_policy_reason_tags: list[str] = Field(default_factory=list)
    next_step_decision: NextStepDecision | None = None
    last_updated_at: str = ""


class LearningTimelineAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: LearningTimelineActionKind
    label: str
    payload: dict[str, object] = Field(default_factory=dict)


class LearningTimelineEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    session_id: str
    course_id: str
    node_id: str = ""
    category: LearningTimelineCategory
    event_type: LearningTimelineEventType
    created_at: str
    summary: str
    reason_tags: list[LearningTimelineReasonTag] = Field(default_factory=list)
    details: dict[str, object] = Field(default_factory=dict)
    actions: list[LearningTimelineAction] = Field(default_factory=list)
    highlighted: bool = False
