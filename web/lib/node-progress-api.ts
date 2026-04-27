import { apiUrl } from "@/lib/api";

export type NodeStatus = "explored" | "mastered";

export async function markNodeProgress(
  sessionId: string,
  courseId: string,
  nodeId: string,
  status: NodeStatus,
): Promise<void> {
  try {
    await fetch(apiUrl("/api/v1/graph/node-progress"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        course_id: courseId,
        node_id: nodeId,
        status,
      }),
    });
  } catch {
    // Silently fail — progress tracking is non-critical
  }
}

export async function getNodeProgress(
  sessionId: string,
  courseId: string,
): Promise<Record<string, NodeStatus>> {
  try {
    const res = await fetch(
      apiUrl(`/api/v1/graph/node-progress/${encodeURIComponent(courseId)}?session_id=${encodeURIComponent(sessionId)}`),
    );
    if (!res.ok) return {};
    const data = await res.json();
    return (data.progress ?? {}) as Record<string, NodeStatus>;
  } catch {
    return {};
  }
}
