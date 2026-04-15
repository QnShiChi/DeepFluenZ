from deeptutor.services.graph.models import StudentGraphState, NodeType, KnowledgeNode
from deeptutor.services.graph.engine import handle_exam_failure

def test_spawn_side_quest():
    state = StudentGraphState(student_id="st1", current_node_id="n1")
    # Simulate failed exam, engine should append a side quest
    new_state = handle_exam_failure(state, failed_topic="Pointers")
    assert len(new_state.dynamic_nodes) == 1
    assert new_state.dynamic_nodes[0].node_type == NodeType.SIDE_QUEST
    assert "Pointers" in new_state.dynamic_nodes[0].title
