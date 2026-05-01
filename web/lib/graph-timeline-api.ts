import { apiUrl } from "./api.ts";

export type GraphTimelineCategory = "node" | "quiz" | "remediation" | "recommendation";
export type GraphTimelineReasonTag =
  | "prerequisite_ready"
  | "recent_weakness"
  | "retry_passed"
  | "remediation_active"
  | "remediation_cleared"
  | "advanced_to_next"
  | "manual_retry";

export interface GraphTimelineAction {
  kind:
    | "focus_node"
    | "open_node_detail"
    | "retry_quiz"
    | "start_remediation"
    | "open_recommendation_target";
  label: string;
  payload?: Record<string, unknown>;
}

export interface GraphTimelineEvent {
  event_id: string;
  session_id: string;
  course_id: string;
  node_id: string;
  category: GraphTimelineCategory;
  event_type: string;
  created_at: string;
  summary: string;
  reason_tags: GraphTimelineReasonTag[];
  details: Record<string, unknown>;
  actions: GraphTimelineAction[];
  highlighted: boolean;
}

export async function getGraphTimeline(
  courseId: string,
  options: { category?: string; nodeId?: string; limit?: number } = {},
): Promise<GraphTimelineEvent[]> {
  const params = new URLSearchParams();
  if (options.category) params.set("category", options.category);
  if (options.nodeId) params.set("node_id", options.nodeId);
  if (options.limit) params.set("limit", String(options.limit));

  const query = params.toString();
  const response = await fetch(apiUrl(`/api/v1/graph/timeline/${encodeURIComponent(courseId)}${query ? `?${query}` : ""}`));
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as { events?: GraphTimelineEvent[] };
  return Array.isArray(payload.events) ? payload.events : [];
}
