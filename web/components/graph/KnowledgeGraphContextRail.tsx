import React from "react";

import NodeDetailPanel, { type SelectedNodeData } from "./NodeDetailPanel";
import type { NodeStatus, NextStepDecisionSnapshot } from "@/lib/node-progress-api";

export default function KnowledgeGraphContextRail({
  railMode,
  node,
  progressStatus,
  recommendation,
  nextStepDecision,
  onAskAbout,
  onQuizNode,
  onJumpToRecommended,
  onOpenTimeline,
  onCloseAction,
}: {
  railMode: "summary" | "chat" | "quiz";
  node: SelectedNodeData | null;
  progressStatus?: NodeStatus;
  recommendation?: {
    recommendedNodeId: string;
    badge: string;
    message: string;
  };
  nextStepDecision?: NextStepDecisionSnapshot | null;
  onAskAbout: (node: SelectedNodeData) => void;
  onQuizNode: (node: SelectedNodeData) => void;
  onJumpToRecommended?: (nodeId: string) => void;
  onOpenTimeline?: (nodeId: string) => void;
  onCloseAction: () => void;
}) {
  return (
    <div className={railMode === "summary" ? "flex h-full flex-col p-4" : "flex h-full flex-col p-5"}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Tutor Rail</div>
          <h2 className="text-base font-semibold text-slate-900">
            {railMode === "summary" ? "Graph Context" : railMode === "chat" ? "Tutor Session" : "Quiz Workspace"}
          </h2>
        </div>
        {railMode !== "summary" ? (
          <button
            onClick={onCloseAction}
            className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600"
          >
            Return to Graph
          </button>
        ) : null}
      </div>
      <NodeDetailPanel
        embedded
        className="flex-1 overflow-hidden rounded-[24px] border border-slate-200 bg-white"
        node={node}
        progressStatus={progressStatus}
        recommendation={recommendation}
        nextStepDecision={nextStepDecision ? {
          targetNodeId: nextStepDecision.target_node_id,
          badge: nextStepDecision.action,
          message: nextStepDecision.explanation_summary,
          ctaLabel: nextStepDecision.action,
        } : undefined}
        onAskAbout={onAskAbout}
        onQuizNode={onQuizNode}
        onJumpToRecommended={onJumpToRecommended}
        onOpenTimeline={onOpenTimeline}
        onClose={onCloseAction}
      />
    </div>
  );
}
