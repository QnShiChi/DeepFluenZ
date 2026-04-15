from deeptutor.services.graph.models import KnowledgeNode, NodeType

def test_knowledge_node_creation():
    node = KnowledgeNode(node_id="n1", title="Loops", node_type=NodeType.MAIN, dependencies=[])
    assert node.node_id == "n1"
    assert node.node_type == NodeType.MAIN

def test_student_graph_state():
    from deeptutor.services.graph.models import StudentGraphState
    state = StudentGraphState(student_id="st1", current_node_id="n1")
    assert state.dynamic_nodes == []
