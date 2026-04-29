import { apiUrl } from "./api.ts";

export type GraphQaIssueSeverity = "critical" | "high" | "medium" | "low";
export type GraphQaFixChangeType =
  | "change_relation_type"
  | "add_prerequisite_edge"
  | "remove_prerequisite_edge";
export type GraphAdaptiveGateStatus = "adaptive_ready" | "adaptive_limited" | "adaptive_blocked";

export interface GraphQaIssue {
  issue_id: string;
  severity: GraphQaIssueSeverity;
  kind: string;
  message: string;
  affected_node_ids: string[];
  affected_edge_ids: string[];
  why_it_matters: string;
}

export interface GraphQaSuggestedFix {
  fix_id: string;
  issue_id: string;
  confidence: number;
  change_type: GraphQaFixChangeType;
  preview: Record<string, object | string | number | boolean | null>;
  safe_for_bulk_apply: boolean;
}

export interface GraphQaGate {
  status: GraphAdaptiveGateStatus;
  blocking_issue_ids: string[];
  student_visible_message: string;
  instructor_message: string;
}

export interface GraphQaDraftChange {
  change_id: string;
  fix_id: string;
  change_type: GraphQaFixChangeType;
  preview: Record<string, object | string | number | boolean | null>;
}

export interface GraphQaDraft {
  course_id: string;
  changes: GraphQaDraftChange[];
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
  gate_status: GraphQaGate;
}

async function expectJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getGraphQaReport(courseId: string): Promise<GraphQaReport | null> {
  const response = await fetch(apiUrl(`/api/v1/graph/qa/${encodeURIComponent(courseId)}`));
  if (response.status === 404) return null;
  return expectJson<GraphQaReport>(response);
}

export async function analyzeGraphQa(courseId: string): Promise<GraphQaReport> {
  const response = await fetch(apiUrl(`/api/v1/graph/qa/analyze/${encodeURIComponent(courseId)}`), {
    method: "POST",
  });
  return expectJson<GraphQaReport>(response);
}

export async function applyGraphQaFix(courseId: string, fixId: string): Promise<GraphQaReport> {
  const response = await fetch(apiUrl(`/api/v1/graph/qa/fixes/${encodeURIComponent(courseId)}/apply`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fix_id: fixId }),
  });
  return expectJson<GraphQaReport>(response);
}

export async function stageGraphQaFixes(courseId: string, fixIds: string[]): Promise<GraphQaDraft> {
  const response = await fetch(apiUrl(`/api/v1/graph/qa/fixes/${encodeURIComponent(courseId)}/draft`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fix_ids: fixIds }),
  });
  return expectJson<GraphQaDraft>(response);
}

export async function getGraphQaDraft(courseId: string): Promise<GraphQaDraft | null> {
  const response = await fetch(apiUrl(`/api/v1/graph/qa/draft/${encodeURIComponent(courseId)}`));
  if (response.status === 404) return null;
  return expectJson<GraphQaDraft>(response);
}

export async function commitGraphQaDraft(courseId: string): Promise<GraphQaReport> {
  const response = await fetch(apiUrl(`/api/v1/graph/qa/draft/${encodeURIComponent(courseId)}/commit`), {
    method: "POST",
  });
  return expectJson<GraphQaReport>(response);
}

export async function getGraphQaGate(courseId: string): Promise<GraphQaGate | null> {
  const report = await getGraphQaReport(courseId);
  return report?.gate_status ?? null;
}

export function collectSafeBulkFixIds(
  fixes: Array<Pick<GraphQaSuggestedFix, "fix_id" | "safe_for_bulk_apply">>,
): string[] {
  return fixes
    .filter((fix) => fix.safe_for_bulk_apply)
    .map((fix) => fix.fix_id);
}
