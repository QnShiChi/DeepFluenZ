from enum import Enum
from dataclasses import dataclass, field
from typing import List

class NodeType(Enum):
    MAIN = "MAIN"
    SIDE_QUEST = "SIDE_QUEST"

@dataclass
class KnowledgeNode:
    node_id: str
    title: str
    node_type: NodeType
    dependencies: List[str] = field(default_factory=list)

@dataclass
class CourseGraphTemplate:
    course_id: str
    nodes: List[KnowledgeNode] = field(default_factory=list)

@dataclass
class StudentGraphState:
    student_id: str
    current_node_id: str
    mastered_nodes: List[str] = field(default_factory=list)
    dynamic_nodes: List[KnowledgeNode] = field(default_factory=list)
