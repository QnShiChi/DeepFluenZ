import React from "react";

import type {
  CytoscapeEdgeElement,
  CytoscapeNodeElement,
} from "../../lib/cytoscape-knowledge-graph.ts";
import type { CytoscapeGraphPoint } from "../../lib/cytoscape-knowledge-graph-layout.ts";
import CytoscapeGraphCanvas from "./CytoscapeGraphCanvas";

export default function KnowledgeGraphFocusInset({
  title,
  nodes,
  edges,
  positions,
  onNodeClick,
  onOpenDetail,
  onAskAbout,
  onStartQuiz,
  onPinCluster,
  onClearFocus,
}: {
  title: string;
  nodes: CytoscapeNodeElement[];
  edges: CytoscapeEdgeElement[];
  positions: Record<string, CytoscapeGraphPoint>;
  onNodeClick: (nodeId: string) => void;
  onOpenDetail: () => void;
  onAskAbout: () => void;
  onStartQuiz: () => void;
  onPinCluster: () => void;
  onClearFocus: () => void;
}) {
  return (
    <section className="rounded-[24px] border border-white/15 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-300">
            Focused Cluster
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <button
          onClick={onClearFocus}
          className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-slate-200"
        >
          Clear
        </button>
      </div>
      <div className="h-[320px] overflow-hidden rounded-[18px] border border-white/10 bg-slate-900">
        <CytoscapeGraphCanvas
          nodes={nodes}
          edges={edges}
          positions={positions}
          onNodeClick={onNodeClick}
          surfaceVariant="focus"
          className="h-full min-h-[320px]"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onOpenDetail}
          className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white"
        >
          Open Detail
        </button>
        <button
          onClick={onAskAbout}
          className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950"
        >
          Ask Tutor
        </button>
        <button
          onClick={onStartQuiz}
          className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white"
        >
          Start Quiz
        </button>
        <button
          onClick={onPinCluster}
          className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white"
        >
          Pin
        </button>
      </div>
    </section>
  );
}
