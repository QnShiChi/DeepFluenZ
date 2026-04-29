import React, { useCallback, useEffect, useState, useRef } from "react";
import { ReactFlow, Background, Controls, Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import NodeDetailPanel, { type SelectedNodeData } from "./NodeDetailPanel";
import GraphHealthPanel from "./GraphHealthPanel";
import { UnifiedWSClient, StreamEvent } from "@/lib/unified-ws";
import { apiUrl } from "@/lib/api";
import { getSession } from "@/lib/session-api";
import {
  readStoredKnowledgeGraphCourseId,
  resolveKnowledgeGraphCourseId,
  resolveKnowledgeGraphLoadState,
  writeStoredKnowledgeGraphCourseId,
} from "@/lib/knowledge-graph-course";
import { mapCourseKnowledgeGraphToFlow } from "@/lib/course-knowledge-graph";
import { KNOWLEDGE_GRAPH_COPY } from "@/lib/knowledge-graph-copy";
import { describeCourseTemplateImport } from "@/lib/course-template-import-feedback";
import {
  getNodeProgress,
  markNodeProgress,
  setCurrentGraphNode,
  type DynamicKnowledgeGraphNode,
  type NodeStatus,
} from "@/lib/node-progress-api";
import { getGraphRecommendation, type GraphRecommendation } from "@/lib/graph-recommendation-api";
import { describeGraphRecommendation } from "@/lib/graph-recommendation-ui";
import {
  clearStoredKnowledgeGraphProgress,
  mergeKnowledgeGraphProgress,
  readStoredKnowledgeGraphProgress,
  reconcileKnowledgeGraphProgressAfterSync,
  writeStoredKnowledgeGraphProgress,
} from "@/lib/knowledge-graph-progress";
import {
  readStoredKnowledgeGraphState,
  writeStoredKnowledgeGraphState,
} from "@/lib/knowledge-graph-state";
import {
  applyGraphQaFix,
  getGraphQaDraft,
  getGraphQaReport,
  stageGraphQaFixes,
  type GraphQaDraft,
  type GraphQaIssue,
  type GraphQaReport,
} from "@/lib/graph-qa-api";

type IssuesByNodeId = Record<string, Array<{ severity: "critical" | "high" | "medium" | "low"; kind: string }>>;

const DEFAULT_NODES: Node[] = [
  { id: "1", position: { x: 250, y: 50 }, data: { label: "Chapter 1: Intro" }, type: "default" },
  { id: "2", position: { x: 250, y: 200 }, data: { label: "Chapter 2: Vars" }, type: "default" },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e1-2", source: "1", target: "2" },
];

interface GraphStatePayload {
  current_node_id: string;
  mastered_nodes: string[];
  dynamic_nodes: DynamicKnowledgeGraphNode[];
}

function styleNodeForProgress(node: Node, status?: NodeStatus): Node {
  const graphState = (node.data as Record<string, unknown>).graphState as string | undefined;

  if (graphState === "locked") {
    return node;
  }
  if (graphState === "in_progress") {
    return {
      ...node,
      style: {
        ...node.style,
        border: "2px solid #0ea5e9",
        boxShadow: "0 0 0 4px rgba(14, 165, 233, 0.14)",
      },
    };
  }
  if (status === "mastered") {
    return {
      ...node,
      style: {
        ...node.style,
        border: "2px solid #22c55e",
        boxShadow: "0 0 10px rgba(34, 197, 94, 0.2)",
      },
    };
  }
  if (status === "explored") {
    return {
      ...node,
      style: {
        ...node.style,
        border: "2px solid #f59e0b",
        boxShadow: node.style?.boxShadow ?? "none",
      },
    };
  }
  return node;
}

export default function KnowledgeGraphViewer({
  sessionId,
  onAskAbout,
  onQuizNode,
}: {
  sessionId?: string;
  onAskAbout?: (node: SelectedNodeData) => void;
  onQuizNode?: (node: SelectedNodeData) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>(DEFAULT_NODES);
  const [edges, setEdges] = useState<Edge[]>(DEFAULT_EDGES);
  const [graphTemplate, setGraphTemplate] = useState<{ nodes?: any[]; edges?: any[]; [key: string]: unknown } | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, NodeStatus>>({});
  const [currentNodeId, setCurrentNodeId] = useState<string>("");
  const [dynamicNodes, setDynamicNodes] = useState<DynamicKnowledgeGraphNode[]>([]);
  const [recommendation, setRecommendation] = useState<GraphRecommendation | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeData | null>(null);
  const [qaReport, setQaReport] = useState<GraphQaReport | null>(null);
  const [qaDraft, setQaDraft] = useState<GraphQaDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildIssuesByNodeId = useCallback((report: GraphQaReport | null): IssuesByNodeId => {
    const issuesByNodeId: IssuesByNodeId = {};

    (report?.issues ?? []).forEach((issue) => {
      issue.affected_node_ids.forEach((nodeId) => {
        issuesByNodeId[nodeId] ??= [];
        issuesByNodeId[nodeId].push({ severity: issue.severity, kind: issue.kind });
      });
    });

    return issuesByNodeId;
  }, []);

  const selectNode = useCallback((node: Node) => {
    setSelectedNode({
      id: node.id,
      title: (node.data as Record<string, unknown>).label as string || node.id,
      description: (node.data as Record<string, unknown>).description as string || "",
      nodeType: (node.data as Record<string, unknown>).nodeType as string || "topic",
      difficulty: (node.data as Record<string, unknown>).difficulty as string || "medium",
      courseId: courseId ?? undefined,
      graphState: (node.data as Record<string, unknown>).graphState as string | undefined,
      hasUnmetPrerequisites: Boolean((node.data as Record<string, unknown>).hasUnmetPrerequisites),
      qaIssues: qaReport?.issues.filter((issue) => issue.affected_node_ids.includes(node.id)) ?? [],
    });
  }, [courseId, qaReport]);

  const persistRuntimeState = useCallback((nextCurrentNodeId: string, nextDynamicNodes: DynamicKnowledgeGraphNode[]) => {
    if (!courseId) return;
    writeStoredKnowledgeGraphState(courseId, {
      currentNodeId: nextCurrentNodeId,
      dynamicNodes: nextDynamicNodes,
    });
  }, [courseId]);

  const refreshRecommendation = useCallback(async (
    targetCourseId?: string | null,
  ): Promise<GraphRecommendation | null> => {
    const resolvedCourseId = targetCourseId ?? courseId;
    if (!sessionId || !resolvedCourseId) {
      setRecommendation(null);
      return null;
    }
    const nextRecommendation = await getGraphRecommendation(sessionId, resolvedCourseId);
    setRecommendation(nextRecommendation);
    return nextRecommendation;
  }, [courseId, sessionId]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    selectNode(node);
    setCurrentNodeId(node.id);
    persistRuntimeState(node.id, dynamicNodes);
    if (sessionId && courseId) {
      void setCurrentGraphNode(sessionId, courseId, node.id).then((ok) => {
        if (ok) {
          void refreshRecommendation(courseId);
        }
      });
    }
  }, [courseId, dynamicNodes, persistRuntimeState, refreshRecommendation, selectNode, sessionId]);

  const handleJumpToRecommended = useCallback((nodeId: string) => {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target) return;
    selectNode(target);
  }, [nodes, selectNode]);

  const applyCourseTemplate = useCallback((
    data: { nodes?: any[]; edges?: any[]; [key: string]: unknown },
    currentProgress: Record<string, NodeStatus>,
    runtimeState: { currentNodeId: string; dynamicNodes: DynamicKnowledgeGraphNode[] },
    recommendedNodeId?: string | null,
  ) => {
    if (!data || !data.nodes) return;
    const mergedNodes = [...data.nodes];
    const mergedEdges = [...(data.edges ?? [])];
    const existingNodeIds = new Set(mergedNodes.map((node) => String(node.node_id ?? "")).filter(Boolean));
    const existingEdgeIds = new Set(mergedEdges.map((edge) => String(edge.edge_id ?? "")).filter(Boolean));

    runtimeState.dynamicNodes.forEach((dynNode) => {
      if (!existingNodeIds.has(dynNode.node_id)) {
        mergedNodes.push({
          node_id: dynNode.node_id,
          title: dynNode.title,
          node_type: "topic",
          description: "Nút phụ trợ được sinh ra từ tiến trình học hiện tại.",
          difficulty: "medium",
          learning_outcomes: [],
          examples: [],
          related_questions: [],
          resources: [],
          source_refs: [],
        });
      }

      dynNode.dependencies?.forEach((depId) => {
        const edgeId = `dynamic-${depId}-${dynNode.node_id}`;
        if (existingEdgeIds.has(edgeId)) return;
        mergedEdges.push({
          edge_id: edgeId,
          source: depId,
          target: dynNode.node_id,
          relation_type: "related_to",
          confidence: 1,
          rationale: "",
          source_refs: [],
        });
      });
    });

    const flow = mapCourseKnowledgeGraphToFlow(
      {
        ...(data as any),
        nodes: mergedNodes,
        edges: mergedEdges,
      },
      {
        recommendedNodeId,
        currentNodeId: runtimeState.currentNodeId,
        progressMap: currentProgress,
        issuesByNodeId: buildIssuesByNodeId(qaReport),
      },
    );
    const styledNodes = flow.nodes.map((node) => styleNodeForProgress(node, currentProgress[node.id]));

    setNodes(styledNodes);
    setEdges(flow.edges);
  }, [buildIssuesByNodeId, qaReport]);

  const refreshGraphQa = useCallback(async (targetCourseId: string) => {
    const [report, draft] = await Promise.all([
      getGraphQaReport(targetCourseId).catch(() => null),
      getGraphQaDraft(targetCourseId).catch(() => null),
    ]);
    setQaReport(report);
    setQaDraft(draft);
  }, []);

  const handleAnalyzeGraph = useCallback(() => {
    if (!courseId) return;
    void fetch(apiUrl(`/api/v1/graph/qa/analyze/${encodeURIComponent(courseId)}`), {
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to analyze graph: ${response.status}`);
        }
        return response.json() as Promise<GraphQaReport>;
      })
      .then((report) => {
        setQaReport(report);
        void getGraphQaDraft(courseId).then(setQaDraft).catch(() => setQaDraft(null));
      })
      .catch(() => {
        void refreshGraphQa(courseId);
      });
  }, [courseId, refreshGraphQa]);

  const handleFocusIssue = useCallback((issue: GraphQaIssue) => {
    const targetNodeId = issue.affected_node_ids[0];
    if (!targetNodeId) return;
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    if (!targetNode) return;
    selectNode(targetNode);
    setCurrentNodeId(targetNode.id);
    persistRuntimeState(targetNode.id, dynamicNodes);
  }, [dynamicNodes, nodes, persistRuntimeState, selectNode]);

  const handleApplyFix = useCallback((fixId: string) => {
    if (!courseId) return;
    void applyGraphQaFix(courseId, fixId)
      .then((report) => {
        setQaReport(report);
        return getGraphQaDraft(courseId).catch(() => null);
      })
      .then((draft) => {
        setQaDraft(draft);
      })
      .catch(() => {
        void refreshGraphQa(courseId);
      });
  }, [courseId, refreshGraphQa]);

  const handleStageSafeFixes = useCallback(() => {
    if (!courseId || !qaReport) return;
    const safeFixIds = qaReport.suggested_fixes
      .filter((fix) => fix.safe_for_bulk_apply)
      .map((fix) => fix.fix_id);
    if (!safeFixIds.length) return;

    void stageGraphQaFixes(courseId, safeFixIds)
      .then((draft) => {
        setQaDraft(draft);
      })
      .catch(() => {
        void refreshGraphQa(courseId);
      });
  }, [courseId, qaReport, refreshGraphQa]);

  const updateNodeProgress = useCallback((
    nodeId: string,
    status: NodeStatus,
    opts?: { persistRemote?: boolean },
  ) => {
    if (!courseId) return;

    setProgressMap((prev) => {
      const merged = mergeKnowledgeGraphProgress(prev, { [nodeId]: status });
      writeStoredKnowledgeGraphProgress(courseId, merged);
      return merged;
    });

    setNodes((prevNodes) => prevNodes.map((node) => (
      node.id === nodeId ? styleNodeForProgress(node, status) : node
    )));

    if (opts?.persistRemote !== false && sessionId) {
      void markNodeProgress(
        sessionId,
        courseId,
        nodeId,
        status,
        currentNodeId || nodeId,
      ).then((ok) => {
        if (ok) {
          const persisted = readStoredKnowledgeGraphProgress(courseId);
          writeStoredKnowledgeGraphProgress(
            courseId,
            reconcileKnowledgeGraphProgressAfterSync(persisted, {}),
          );
          void refreshRecommendation(courseId);
        }
      });
    }
  }, [courseId, currentNodeId, refreshRecommendation, sessionId]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".pdf")) {
      setIsExtracting(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(apiUrl("/api/v1/course-templates/extract-pdf"), {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const resData = await res.json();
          alert(describeCourseTemplateImport(resData).message);
          setCourseId(resData.course_id);
          writeStoredKnowledgeGraphCourseId(resData.course_id);
        } else {
          try {
            const err = await res.json();
            alert(`Failed to extract PDF: ${err.detail || "Unknown error"}`);
          } catch {
            alert("Failed to extract PDF.");
          }
        }
      } catch (err) {
        console.error("Extraction error", err);
        alert("Upload failed");
      } finally {
        setIsExtracting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const res = await fetch(apiUrl("/api/v1/course-templates/import"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...json,
            ...(sessionId ? { session_id: sessionId } : {}),
          }),
        });
        if (res.ok) {
          const resData = await res.json();
          alert(describeCourseTemplateImport(resData).message);
          setCourseId(resData.course_id);
          writeStoredKnowledgeGraphCourseId(resData.course_id);
        } else {
          alert("Failed to import.");
        }
      } catch (err) {
        console.error("Import error", err);
        alert("Invalid JSON file");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    let cancelled = false;

    async function restoreCourseTemplate() {
      const storedCourseId = readStoredKnowledgeGraphCourseId();
      let resolvedCourseId = storedCourseId;

      if (sessionId) {
        try {
          const session = await getSession(sessionId);
          resolvedCourseId = resolveKnowledgeGraphCourseId(session.preferences, storedCourseId);
        } catch (error) {
          console.error("Failed to load graph session", error);
        }
      }

      if (cancelled) return;

      if (!resolvedCourseId) {
        setCourseId(null);
        setGraphTemplate(null);
        setNodes(DEFAULT_NODES);
        setEdges(DEFAULT_EDGES);
        return;
      }

      setCourseId(resolvedCourseId);
      writeStoredKnowledgeGraphCourseId(resolvedCourseId);
    }

    void restoreCourseTemplate();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const { shouldLoadTemplate, shouldLoadProgress } = resolveKnowledgeGraphLoadState(courseId, sessionId);
    if (!shouldLoadTemplate || !courseId) return;

    const templatePromise = fetch(apiUrl(`/api/v1/course-templates/${courseId}`)).then((res) => {
      if (!res.ok) throw new Error("Failed to load course template");
      return res.json();
    });
    const progressPromise = shouldLoadProgress && sessionId
      ? getNodeProgress(sessionId, courseId)
      : Promise.resolve({ progress: {}, current_node_id: "", dynamic_nodes: [] });
    const recommendationPromise = shouldLoadProgress && sessionId
      ? getGraphRecommendation(sessionId, courseId)
      : Promise.resolve(null);

    Promise.all([templatePromise, progressPromise, recommendationPromise])
      .then(([templateData, progressSnapshot, recommendationData]) => {
        const storedRuntimeState = readStoredKnowledgeGraphState(courseId);
        const mergedProgress = mergeKnowledgeGraphProgress(
          progressSnapshot.progress,
          readStoredKnowledgeGraphProgress(courseId),
        );
        const mergedRuntimeState = {
          currentNodeId: progressSnapshot.current_node_id || storedRuntimeState.currentNodeId,
          dynamicNodes: progressSnapshot.dynamic_nodes.length
            ? progressSnapshot.dynamic_nodes
            : storedRuntimeState.dynamicNodes,
        };
        setGraphTemplate(templateData);
        setProgressMap(mergedProgress);
        setCurrentNodeId(mergedRuntimeState.currentNodeId);
        setDynamicNodes(mergedRuntimeState.dynamicNodes);
        persistRuntimeState(mergedRuntimeState.currentNodeId, mergedRuntimeState.dynamicNodes);
        setRecommendation(recommendationData);
      })
      .catch(console.error);
  }, [courseId, persistRuntimeState, sessionId]);

  useEffect(() => {
    if (!courseId) {
      setQaReport(null);
      setQaDraft(null);
      return;
    }

    void refreshGraphQa(courseId);
  }, [courseId, refreshGraphQa]);

  useEffect(() => {
    if (!selectedNode?.id) return;
    setSelectedNode((prev) => {
      if (!prev) return prev;
      const qaIssues = qaReport?.issues.filter((issue) => issue.affected_node_ids.includes(prev.id)) ?? [];
      const prevIssueIds = (prev.qaIssues ?? []).map((issue) => issue.issue_id).join("|");
      const nextIssueIds = qaIssues.map((issue) => issue.issue_id).join("|");
      if (prevIssueIds === nextIssueIds) {
        return prev;
      }
      return {
        ...prev,
        qaIssues,
      };
    });
  }, [qaReport, selectedNode?.id]);

  useEffect(() => {
    if (!graphTemplate?.nodes) return;
    applyCourseTemplate(
      graphTemplate,
      progressMap,
      { currentNodeId, dynamicNodes },
      recommendation?.recommended_node_id ?? null,
    );
  }, [applyCourseTemplate, currentNodeId, dynamicNodes, graphTemplate, progressMap, recommendation]);

  useEffect(() => {
    if (!sessionId || !courseId) return;

    let cancelled = false;

    async function flushPendingProgress() {
      const pendingProgress = readStoredKnowledgeGraphProgress(courseId);
      const entries = Object.entries(pendingProgress);
      if (!entries.length) return;

      const failed: Record<string, NodeStatus> = {};
      for (const [nodeId, status] of entries) {
        const ok = await markNodeProgress(
          sessionId,
          courseId,
          nodeId,
          status,
          readStoredKnowledgeGraphState(courseId).currentNodeId || currentNodeId || nodeId,
        );
        if (!ok) {
          failed[nodeId] = status;
        }
      }

      if (cancelled) return;
      const pendingAfterSync = reconcileKnowledgeGraphProgressAfterSync(pendingProgress, failed);
      if (Object.keys(pendingAfterSync).length) {
        writeStoredKnowledgeGraphProgress(courseId, pendingAfterSync);
      } else {
        clearStoredKnowledgeGraphProgress(courseId);
      }
    }

    void flushPendingProgress();

    return () => {
      cancelled = true;
    };
  }, [courseId, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    
    let isConnected = true;
    const client = new UnifiedWSClient((event: StreamEvent) => {
      // The push_custom_event emits a RESULT event with event_type = "graph_updated"
      if (event.type === "result" && event.metadata?.event_type === "graph_updated") {
        const state = event.metadata.state as GraphStatePayload;
        if (!state) return;

        const nextCurrentNodeId = state.current_node_id || currentNodeId;
        setCurrentNodeId(nextCurrentNodeId);
        setDynamicNodes(state.dynamic_nodes ?? []);
        persistRuntimeState(nextCurrentNodeId, state.dynamic_nodes ?? []);
        if (courseId) {
          void refreshRecommendation(courseId);
        }
      }
    });

    client.connect();

    // Small delay to ensure WS is open before subscribing
    setTimeout(() => {
      if (isConnected && client.connected) {
        client.send({ type: "subscribe_session", session_id: sessionId });
      }
    }, 500);

    return () => {
      isConnected = false;
      client.disconnect();
    };
  }, [courseId, currentNodeId, persistRuntimeState, refreshRecommendation, sessionId]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionId || !courseId) return;

    const handleGraphQuizUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ course_id?: string; node_id?: string }>).detail;
      if (!detail || detail.course_id !== courseId) return;

      void getNodeProgress(sessionId, courseId).then((progressSnapshot) => {
        const mergedProgress = mergeKnowledgeGraphProgress(
          progressSnapshot.progress,
          readStoredKnowledgeGraphProgress(courseId),
        );
        setProgressMap(mergedProgress);
        setCurrentNodeId(progressSnapshot.current_node_id || detail.node_id || "");
        setDynamicNodes(progressSnapshot.dynamic_nodes ?? []);
        persistRuntimeState(
          progressSnapshot.current_node_id || detail.node_id || "",
          progressSnapshot.dynamic_nodes ?? [],
        );
      });
      void refreshRecommendation(courseId);
    };

    window.addEventListener("deeptutor:graph-quiz-updated", handleGraphQuizUpdated as EventListener);
    return () => {
      window.removeEventListener("deeptutor:graph-quiz-updated", handleGraphQuizUpdated as EventListener);
    };
  }, [courseId, persistRuntimeState, refreshRecommendation, sessionId]);

  return (
    <div className="w-full h-full bg-slate-50 relative">
      {recommendation ? (
        <div className="absolute top-20 left-4 z-10 w-72 rounded-xl border border-blue-200 bg-white/95 p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
            {describeGraphRecommendation(recommendation).badge}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {describeGraphRecommendation(recommendation).message}
          </p>
        </div>
      ) : null}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <input 
          type="file" 
          accept=".json,.pdf" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          onChange={handleImport} 
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isExtracting}
          className="bg-white px-4 py-2 rounded shadow text-sm font-medium border border-gray-200 hover:bg-gray-50 text-slate-700 disabled:opacity-50"
        >
          {isExtracting ? KNOWLEDGE_GRAPH_COPY.extractingGraph : KNOWLEDGE_GRAPH_COPY.importSyllabus}
        </button>
      </div>
      <GraphHealthPanel
        report={qaReport}
        draft={qaDraft}
        onAnalyze={handleAnalyzeGraph}
        onFocusIssue={handleFocusIssue}
        onApplyFix={handleApplyFix}
        onStageSafeFixes={handleStageSafeFixes}
      />
      <ReactFlow nodes={nodes} edges={edges} onNodeClick={handleNodeClick} fitView>
        <Background />
        <Controls />
      </ReactFlow>
      <NodeDetailPanel
        node={selectedNode}
        progressStatus={selectedNode ? progressMap[selectedNode.id] : undefined}
        recommendation={recommendation ? {
          recommendedNodeId: recommendation.recommended_node_id,
          badge: describeGraphRecommendation(recommendation).badge,
          message: describeGraphRecommendation(recommendation).message,
        } : undefined}
        qaIssues={selectedNode?.qaIssues ?? []}
        onClose={() => setSelectedNode(null)}
        onJumpToRecommended={handleJumpToRecommended}
        onAskAbout={(n) => {
          setSelectedNode(null);
          setCurrentNodeId(n.id);
          persistRuntimeState(n.id, dynamicNodes);
          updateNodeProgress(n.id, "explored");
          onAskAbout?.(n);
        }}
        onQuizNode={(n) => {
          setSelectedNode(null);
          setCurrentNodeId(n.id);
          persistRuntimeState(n.id, dynamicNodes);
          updateNodeProgress(n.id, "explored");
          onQuizNode?.(n);
        }}
      />
    </div>
  );
}
