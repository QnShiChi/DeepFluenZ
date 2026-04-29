import type { GraphQaIssue, GraphQaIssueSeverity, GraphQaReport } from "./graph-qa-api.ts";

export interface GroupedGraphQaIssues {
  critical: GraphQaIssue[];
  high: GraphQaIssue[];
  medium: GraphQaIssue[];
  low: GraphQaIssue[];
}

export function groupGraphQaIssues(issues: GraphQaIssue[]): GroupedGraphQaIssues {
  const grouped: GroupedGraphQaIssues = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };

  issues.forEach((issue) => {
    grouped[issue.severity].push(issue);
  });

  return grouped;
}

export function getGraphQaSeverityLabel(severity: GraphQaIssueSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function describeGraphHealthStatus(report: GraphQaReport | null): string {
  if (!report) {
    return "Graph health has not been analyzed yet.";
  }
  return describeAdaptiveGateStatus(report.gate_status.status);
}

export function resolveGraphQaIssueNode<T extends { id: string }>(
  nodes: T[],
  issue: GraphQaIssue,
): T | null {
  const targetNodeId = issue.affected_node_ids[0];
  if (!targetNodeId) {
    return null;
  }
  return nodes.find((node) => node.id === targetNodeId) ?? null;
}

export function describeAdaptiveGateStatus(status: GraphQaReport["gate_status"]["status"]): string {
  if (status === "adaptive_blocked") {
    return "Adaptive guidance is blocked until critical graph issues are resolved.";
  }
  if (status === "adaptive_limited") {
    return "Adaptive guidance is available, but the graph still has quality issues.";
  }
  return "Adaptive guidance is ready.";
}
