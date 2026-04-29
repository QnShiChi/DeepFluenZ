import React from "react";

import type { GraphQaDraft, GraphQaIssue, GraphQaReport } from "@/lib/graph-qa-api";
import {
  describeGraphHealthStatus,
  getGraphQaSeverityLabel,
  groupGraphQaIssues,
} from "@/lib/graph-qa-ui";

export interface GraphHealthPanelProps {
  report: GraphQaReport | null;
  draft: GraphQaDraft | null;
  busy?: boolean;
  onAnalyze: () => void;
  onFocusIssue: (issue: GraphQaIssue) => void;
  onApplyFix: (fixId: string) => void;
  onStageSafeFixes: () => void;
  onCommitDraft: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function GraphHealthPanel({
  report,
  draft,
  busy = false,
  onAnalyze,
  onFocusIssue,
  onApplyFix,
  onStageSafeFixes,
  onCommitDraft,
}: GraphHealthPanelProps) {
  const grouped = groupGraphQaIssues(report?.issues ?? []);
  const stagedCount = draft?.changes.length ?? 0;

  return (
    <aside className="absolute top-20 right-4 z-10 w-80 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Graph Health</h2>
          <p className="mt-1 text-sm text-slate-600">
            {describeGraphHealthStatus(report)}
          </p>
        </div>
        <button
          onClick={onAnalyze}
          disabled={busy}
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
        {report?.suggested_fixes.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Suggested Fixes
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  {report.suggested_fixes.length} fix suggestions, {report.suggested_fixes.filter((fix) => fix.safe_for_bulk_apply).length} safe for bulk apply.
                </p>
              </div>
              <button
                onClick={onStageSafeFixes}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-white disabled:opacity-50"
              >
                Stage Safe
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {report.suggested_fixes.map((fix) => (
                <div key={fix.fix_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{fix.change_type}</div>
                      <p className="mt-1 break-all text-[11px] text-slate-500">{fix.fix_id}</p>
                    </div>
                    <button
                      onClick={() => onApplyFix(fix.fix_id)}
                      disabled={busy}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stagedCount ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Draft Changes</div>
                <p className="mt-1">{stagedCount} staged change{stagedCount > 1 ? "s" : ""} ready to commit.</p>
              </div>
              <button
                onClick={onCommitDraft}
                disabled={busy}
                className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                Commit Draft
              </button>
            </div>
          </div>
        ) : null}

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
