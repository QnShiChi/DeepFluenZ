import { apiUrl } from "./api";

export interface GraphRecommendation {
  recommended_node_id: string;
  mode: "advance" | "review" | "remediate";
  score: number;
  reason_codes: string[];
  backup_node_ids: string[];
  review_mode?: "focused_review" | "full_node_review" | "light_recall_check";
}

export async function getGraphRecommendation(
  sessionId: string,
  courseId: string,
): Promise<GraphRecommendation | null> {
  const res = await fetch(
    apiUrl(`/api/v1/graph/recommendation/${encodeURIComponent(courseId)}?session_id=${encodeURIComponent(sessionId)}`),
  );
  if (!res.ok) return null;
  return (await res.json()) as GraphRecommendation;
}
