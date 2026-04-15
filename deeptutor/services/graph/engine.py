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
