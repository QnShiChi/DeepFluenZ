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

export interface ReviewQueueEntrySnapshot {
  node_id: string;
  review_mode: "focused_review" | "full_node_review" | "light_recall_check";
  score: number;
  due_at: string;
  reason_codes: string[];
}

export interface ReviewStateSnapshot {
  nodes: Record<string, {
    due_at: string;
    forgetting_risk: number;
    retrievability: number;
    review_mode: ReviewQueueEntrySnapshot["review_mode"];
  }>;
}

export interface NodeProgressSnapshot {
  progress: Record<string, NodeStatus>;
  current_node_id: string;
  dynamic_nodes: DynamicKnowledgeGraphNode[];
  active_remediation: ActiveGraphRemediationSnapshot | null;
  review_state?: ReviewStateSnapshot | null;
  review_queue?: ReviewQueueEntrySnapshot[];
  in_session_knowledge_state?: Record<string, unknown> | null;
  next_step_decision?: NextStepDecisionSnapshot | null;
}

export interface NextStepDecisionSnapshot {
  action: string;
  target_node_id: string;
  reason_tags: string[];
  explanation_summary: string;
}

export function normalizeNodeProgressSnapshot(
  data: Record<string, unknown>,
): NodeProgressSnapshot {
  return {
    progress: (data.progress ?? {}) as Record<string, NodeStatus>,
    current_node_id: String(data.current_node_id ?? ""),
    dynamic_nodes: (data.dynamic_nodes ?? []) as DynamicKnowledgeGraphNode[],
    active_remediation: (data.active_remediation ?? null) as ActiveGraphRemediationSnapshot | null,
    review_state: (data.review_state ?? null) as ReviewStateSnapshot | null,
    review_queue: (data.review_queue ?? []) as ReviewQueueEntrySnapshot[],
    in_session_knowledge_state: (data.in_session_knowledge_state ?? null) as Record<string, unknown> | null,
    next_step_decision: (data.next_step_decision ?? null) as NodeProgressSnapshot["next_step_decision"],
  };
}

async function resolveApiUrl(path: string): Promise<string> {
  const { apiUrl } = await import("./api.ts");
  return apiUrl(path);
}

export async function markNodeProgress(
  sessionId: string,
  courseId: string,
  nodeId: string,
  status: NodeStatus,
  currentNodeId?: string,
): Promise<boolean> {
  try {
    const res = await fetch(await resolveApiUrl("/api/v1/graph/node-progress"), {
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
    const res = await fetch(await resolveApiUrl("/api/v1/graph/current-node"), {
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
      await resolveApiUrl(
        `/api/v1/graph/node-progress/${encodeURIComponent(courseId)}?session_id=${encodeURIComponent(sessionId)}`,
      ),
    );
    if (!res.ok) {
      return {
        progress: {},
        current_node_id: "",
        dynamic_nodes: [],
        active_remediation: null,
        review_state: null,
        review_queue: [],
        in_session_knowledge_state: null,
        next_step_decision: null,
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return normalizeNodeProgressSnapshot(data);
  } catch {
    return {
      progress: {},
      current_node_id: "",
      dynamic_nodes: [],
      active_remediation: null,
      review_state: null,
      review_queue: [],
      in_session_knowledge_state: null,
      next_step_decision: null,
    };
  }
}
