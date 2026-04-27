import React, { useEffect, useRef } from "react";
import { X, MessageSquare, ClipboardCheck, BookOpen, Cpu, Wrench, AppWindow, CheckCircle2, CircleDashed } from "lucide-react";
import {
  formatKnowledgeGraphDifficultyLabel,
  getKnowledgeGraphNodeTypeLabel,
  KNOWLEDGE_GRAPH_COPY,
} from "@/lib/knowledge-graph-copy";
import type { NodeStatus } from "@/lib/node-progress-api";

export interface SelectedNodeData {
  id: string;
  title: string;
  description: string;
  nodeType: string;
  difficulty: string;
  courseId?: string;
  graphState?: string;
  hasUnmetPrerequisites?: boolean;
}

interface NodeDetailPanelProps {
  node: SelectedNodeData | null;
  progressStatus?: NodeStatus;
  recommendation?: {
    recommendedNodeId: string;
    badge: string;
    message: string;
  };
  onClose: () => void;
  onAskAbout: (node: SelectedNodeData) => void;
  onQuizNode: (node: SelectedNodeData) => void;
  onJumpToRecommended?: (nodeId: string) => void;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  hard: "bg-rose-100 text-rose-700 border-rose-200",
};

const NODE_TYPE_CONFIG: Record<string, { label: string; style: string; icon: React.ElementType }> = {
  topic: { label: getKnowledgeGraphNodeTypeLabel("topic"), style: "bg-blue-100 text-blue-700 border-blue-200", icon: BookOpen },
  concept: { label: getKnowledgeGraphNodeTypeLabel("concept"), style: "bg-purple-100 text-purple-700 border-purple-200", icon: Cpu },
  skill: { label: getKnowledgeGraphNodeTypeLabel("skill"), style: "bg-green-100 text-green-700 border-green-200", icon: Wrench },
  application: { label: getKnowledgeGraphNodeTypeLabel("application"), style: "bg-orange-100 text-orange-700 border-orange-200", icon: AppWindow },
};

export default function NodeDetailPanel({
  node,
  progressStatus,
  recommendation,
  onClose,
  onAskAbout,
  onQuizNode,
  onJumpToRecommended,
}: NodeDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!node) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [node, onClose]);

  if (!node) return null;

  const diffStyle = DIFFICULTY_STYLES[node.difficulty] ?? DIFFICULTY_STYLES.medium;
  const typeConfig = NODE_TYPE_CONFIG[node.nodeType] ?? NODE_TYPE_CONFIG.topic;
  const TypeIcon = typeConfig.icon;

  return (
    <div
      ref={panelRef}
      className="absolute top-4 right-4 bottom-4 z-20 w-80 max-w-[calc(100%-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden animate-slide-in-right"
      style={{
        animation: "slideInRight 0.25s ease-out",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-3 border-b border-slate-100">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-slate-800 leading-tight">
            {node.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {progressStatus === "mastered" ? (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-green-100 text-green-700 border border-green-200">
                <CheckCircle2 className="w-3 h-3" />
                <span>Thuần thục</span>
              </span>
            ) : node.graphState === "in_progress" ? (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                <CircleDashed className="w-3 h-3" />
                <span>Đang học</span>
              </span>
            ) : node.graphState === "locked" ? (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                <CircleDashed className="w-3 h-3" />
                <span>Chưa mở khóa</span>
              </span>
            ) : progressStatus === "explored" ? (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                <CircleDashed className="w-3 h-3" />
                <span>Đã tìm hiểu</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                <CircleDashed className="w-3 h-3" />
                <span>Chưa học</span>
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border ${typeConfig.style}`}>
              <TypeIcon className="w-3 h-3" />
              {typeConfig.label}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${diffStyle}`}>
              {formatKnowledgeGraphDifficultyLabel(node.difficulty)}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      <div className="flex-1 overflow-y-auto p-4">
        {recommendation && recommendation.recommendedNodeId !== node.id ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">{recommendation.badge}</div>
            <p className="mt-1">{recommendation.message}</p>
            <button
              onClick={() => onJumpToRecommended?.(recommendation.recommendedNodeId)}
              className="mt-2 text-xs font-medium text-amber-900 underline underline-offset-2"
            >
              {KNOWLEDGE_GRAPH_COPY.recommendedNodeCta}
            </button>
          </div>
        ) : null}
        {node.hasUnmetPrerequisites ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Nút này còn thiếu kiến thức tiên quyết. Bạn vẫn có thể xem trước, nhưng nên hoàn thành các nút nền tảng trước để đi đúng lộ trình.
          </div>
        ) : null}
        {node.description ? (
          <p className="text-sm text-slate-600 leading-relaxed">
            {node.description}
          </p>
        ) : (
          <p className="text-sm text-slate-400 italic">
            {KNOWLEDGE_GRAPH_COPY.noDescription}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 pt-3 border-t border-slate-100 space-y-2">
        <button
          onClick={() => onAskAbout(node)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
        >
          <MessageSquare className="w-4 h-4" />
          {KNOWLEDGE_GRAPH_COPY.askAboutTopic}
        </button>
        <button
          onClick={() => onQuizNode(node)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all shadow-sm"
        >
          <ClipboardCheck className="w-4 h-4" />
          {KNOWLEDGE_GRAPH_COPY.testKnowledge}
        </button>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
