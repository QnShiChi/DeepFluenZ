import React from "react";

import type { GraphQaIssue, GraphQaReport } from "@/lib/graph-qa-api";
import {
  describeAdaptiveGateStatus,
  getGraphQaSeverityLabel,
  groupGraphQaIssues,
} from "@/lib/graph-qa-ui";

export interface GraphHealthPanelProps {
  report: GraphQaReport | null;
  onAnalyze: () => void;
  onFocusIssue: (issue: GraphQaIssue) => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function GraphHealthPanel({
  report,
  onAnalyze,
  onFocusIssue,
}: GraphHealthPanelProps) {
  const grouped = groupGraphQaIssues(report?.issues ?? []);

  return (
    <aside className="absolute top-20 right-4 z-10 w-80 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Graph Health</h2>
          <p className="mt-1 text-sm text-slate-600">
            {describeAdaptiveGateStatus(report?.gate_status.status ?? "adaptive_ready")}
          </p>
        </div>
        <button
          onClick={onAnalyze}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Analyze Graph
        </button>
      </div>

      {report ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-slate-50 px-2 py-2 text-slate-600">
            <div className="font-semibold text-slate-900">{report.health_summary.score}</div>
            <div>Score</div>
          </div>
          <div className="rounded-xl bg-rose-50 px-2 py-2 text-rose-700">
            <div className="font-semibold">{report.health_summary.critical_count}</div>
            <div>Critical</div>
          </div>
          <div className="rounded-xl bg-orange-50 px-2 py-2 text-orange-700">
            <div className="font-semibold">{report.health_summary.high_count}</div>
            <div>High</div>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Analyze the graph to load prerequisite and connectivity issues.
        </p>
      )}

      <section className="mt-4 space-y-3">
        {(["critical", "high", "medium", "low"] as const).map((severity) => {
          const issues = grouped[severity];
          if (!issues.length) {
            return null;
          }

          return (
            <div key={severity}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {getGraphQaSeverityLabel(severity)} ({issues.length})
              </h3>
              <div className="space-y-2">
                {issues.map((issue) => (
                  <button
                    key={issue.issue_id}
                    onClick={() => onFocusIssue(issue)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors hover:opacity-90 ${SEVERITY_STYLES[severity]}`}
                  >
                    <div className="font-semibold">{issue.message}</div>
                    <p className="mt-1 text-[11px] opacity-80">{issue.why_it_matters || issue.kind}</p>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </aside>
  );
}
