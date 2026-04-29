import type { GraphQaReport } from "./graph-qa-api.ts";

export function describeAdaptiveGateStatus(status: GraphQaReport["gate_status"]["status"]): string {
  if (status === "adaptive_blocked") {
    return "Adaptive guidance is blocked until critical graph issues are resolved.";
  }
  if (status === "adaptive_limited") {
    return "Adaptive guidance is available, but the graph still has quality issues.";
  }
  return "Adaptive guidance is ready.";
}
