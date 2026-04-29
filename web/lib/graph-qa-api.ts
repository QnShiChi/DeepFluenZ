import { apiUrl } from "./api";

export interface GraphQaIssue {
  issue_id: string;
  severity: "critical" | "high" | "medium" | "low";
  kind: string;
  message: string;
  affected_node_ids: string[];
  affected_edge_ids: string[];
  why_it_matters: string;
}

export interface GraphQaSuggestedFix {
  issue_id: string;
  summary: string;
  action: string;
}

export interface GraphQaReport {
  course_id: string;
  health_summary: {
    score: number;
    adaptive_ready: boolean;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
  };
  issues: GraphQaIssue[];
  suggested_fixes: GraphQaSuggestedFix[];
  gate_status: {
    status: "adaptive_ready" | "adaptive_limited" | "adaptive_blocked";
    blocking_issue_ids: string[];
    student_visible_message: string;
    instructor_message: string;
  };
}

export async function getGraphQaReport(courseId: string): Promise<GraphQaReport | null> {
  const res = await fetch(apiUrl(`/api/v1/graph/qa/${encodeURIComponent(courseId)}`));
  if (!res.ok) return null;
  return (await res.json()) as GraphQaReport;
}
