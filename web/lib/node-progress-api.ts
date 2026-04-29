import { apiUrl } from "@/lib/api";

export type NodeStatus = "explored" | "mastered";

export interface DynamicKnowledgeGraphNode {
  node_id: string;
  title: string;
  node_type: string;
  dependencies: string[];
}

export interface ActiveGraphRemediationSnapshot {
  source_node_id: string;
  target_node_id: string;
  weak_concepts: string[];
  failure_severity: string;
  status: string;
  attempt_count: number;
  last_node_quiz_score?: number | null;
  last_remediation_quiz_score?: number | null;
}

export interface NodeProgressSnapshot {
  progress: Record<string, NodeStatus>;
  current_node_id: string;
  dynamic_nodes: DynamicKnowledgeGraphNode[];
  active_remediation: ActiveGraphRemediationSnapshot | null;
}

export async function markNodeProgress(
  sessionId: string,
  courseId: string,
  nodeId: string,
  status: NodeStatus,
  currentNodeId?: string,
): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/api/v1/graph/node-progress"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        course_id: courseId,
        node_id: nodeId,
        status,
        current_node_id: currentNodeId ?? nodeId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function setCurrentGraphNode(
  sessionId: string,
  courseId: string,
  nodeId: string,
): Promise<boolean> {
  try {
    const res = await fetch(apiUrl("/api/v1/graph/current-node"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        course_id: courseId,
        node_id: nodeId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getNodeProgress(
  sessionId: string,
  courseId: string,
): Promise<NodeProgressSnapshot> {
  try {
    const res = await fetch(
      apiUrl(`/api/v1/graph/node-progress/${encodeURIComponent(courseId)}?session_id=${encodeURIComponent(sessionId)}`),
    );
    if (!res.ok) {
      return {
        progress: {},
        current_node_id: "",
        dynamic_nodes: [],
        active_remediation: null,
      };
    }
    const data = await res.json();
    return {
      progress: (data.progress ?? {}) as Record<string, NodeStatus>,
      current_node_id: String(data.current_node_id ?? ""),
      dynamic_nodes: (data.dynamic_nodes ?? []) as DynamicKnowledgeGraphNode[],
      active_remediation: (data.active_remediation ?? null) as ActiveGraphRemediationSnapshot | null,
    };
  } catch {
    return {
      progress: {},
      current_node_id: "",
      dynamic_nodes: [],
      active_remediation: null,
    };
  }
}
