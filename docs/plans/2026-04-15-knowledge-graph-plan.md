# Subject Knowledge Graph Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement the backend services and models for the Hybrid Knowledge Graph and the Dynamic Spawning engine.

**Architecture:** Create an `graph` service to manage `CourseGraphTemplate` and `StudentGraphState`. Build the evaluation engine that spawns side quests upon exam failure.

**Tech Stack:** Python, pytest.

---

### Task 1: Knowledge Graph Core Models

**Files:**
- Create: `deeptutor/services/graph/__init__.py`
- Create: `deeptutor/services/graph/models.py`
- Create: `tests/services/graph/test_models.py`

**Step 1: Write the failing test**

```python
# tests/services/graph/test_models.py
from deeptutor.services.graph.models import KnowledgeNode, NodeType

def test_knowledge_node_creation():
    node = KnowledgeNode(node_id="n1", title="Loops", node_type=NodeType.MAIN, dependencies=[])
    assert node.node_id == "n1"
    assert node.node_type == NodeType.MAIN

def test_student_graph_state():
    from deeptutor.services.graph.models import StudentGraphState
    state = StudentGraphState(student_id="st1", current_node_id="n1")
    assert state.dynamic_nodes == []
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/services/graph/test_models.py -v`
Expected: FAIL with "ModuleNotFoundError"

**Step 3: Write minimal implementation**

```python
# deeptutor/services/graph/models.py
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
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/services/graph/test_models.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add deeptutor/services/graph/models.py deeptutor/services/graph/__init__.py tests/services/graph/test_models.py
git commit -m "feat(graph): add core knowledge graph models"
```

### Task 2: Dynamic Spawning Engine Basic Logic

**Files:**
- Create: `deeptutor/services/graph/engine.py`
- Create: `tests/services/graph/test_engine.py`

**Step 1: Write the failing test**

```python
# tests/services/graph/test_engine.py
from deeptutor.services.graph.models import StudentGraphState, NodeType, KnowledgeNode
from deeptutor.services.graph.engine import handle_exam_failure

def test_spawn_side_quest():
    state = StudentGraphState(student_id="st1", current_node_id="n1")
    # Simulate failed exam, engine should append a side quest
    new_state = handle_exam_failure(state, failed_topic="Pointers")
    assert len(new_state.dynamic_nodes) == 1
    assert new_state.dynamic_nodes[0].node_type == NodeType.SIDE_QUEST
    assert "Pointers" in new_state.dynamic_nodes[0].title
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/services/graph/test_engine.py -v`
Expected: FAIL 

**Step 3: Write minimal implementation**

```python
# deeptutor/services/graph/engine.py
from .models import StudentGraphState, KnowledgeNode, NodeType
import uuid

def handle_exam_failure(state: StudentGraphState, failed_topic: str) -> StudentGraphState:
    # Basic logic to inject a side quest node
    side_quest = KnowledgeNode(
        node_id=f"sq_{uuid.uuid4().hex[:8]}",
        title=f"Refresher on {failed_topic}",
        node_type=NodeType.SIDE_QUEST,
        dependencies=[state.current_node_id] 
    )
    state.dynamic_nodes.append(side_quest)
    return state
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/services/graph/test_engine.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add deeptutor/services/graph/engine.py tests/services/graph/test_engine.py
git commit -m "feat(graph): implement side quest dynamic spawning engine"
```
