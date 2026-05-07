import React, { useCallback, useEffect, useState, useRef } from "react";
import { ReactFlow, Background, Controls, Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import NodeDetailPanel, { type SelectedNodeData } from "./NodeDetailPanel";
import GraphHealthPanel from "./GraphHealthPanel";
import LearningTimelineDrawer from "./LearningTimelineDrawer";
import { UnifiedWSClient, StreamEvent } from "@/lib/unified-ws";
import { apiUrl } from "@/lib/api";
import { getSession } from "@/lib/session-api";
import {
  readStoredKnowledgeGraphCourseId,
  resolveKnowledgeGraphCourseId,
  resolveKnowledgeGraphLoadState,
  writeStoredKnowledgeGraphCourseId,
} from "@/lib/knowledge-graph-course";
import {
  filterVisibleFlowEdges,
  filterVisibleFlowNodes,
  mapCourseKnowledgeGraphToFlow,
  type KnowledgeGraphViewMode,
} from "@/lib/course-knowledge-graph";
import { KNOWLEDGE_GRAPH_COPY } from "@/lib/knowledge-graph-copy";
import { describeCourseTemplateImport } from "@/lib/course-template-import-feedback";
import {
  type ActiveGraphRemediationSnapshot,
  getNodeProgress,
  markNodeProgress,
  type ReviewQueueEntrySnapshot,
  setCurrentGraphNode,
  type DynamicKnowledgeGraphNode,
  type NextStepDecisionSnapshot,
  type NodeStatus,
} from "@/lib/node-progress-api";
import { getGraphRecommendation, type GraphRecommendation } from "@/lib/graph-recommendation-api";
import {
  describeGraphRecommendation,
  getGraphRecommendationTimelineCtaLabel,
} from "@/lib/graph-recommendation-ui";
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
  applyLayoutOverrides,
  buildClusterLayout,
} from "@/lib/knowledge-graph-layout";
import {
  analyzeGraphQa,
  applyGraphQaFix,
  collectSafeBulkFixIds,
  commitGraphQaDraft,
  getGraphQaDraft,
  getGraphQaReport,
  stageGraphQaFixes,
  type GraphQaDraft,
  type GraphQaIssue,
  type GraphQaReport,
  type GraphQaSuggestedFix,
} from "@/lib/graph-qa-api";
import { resolveGraphQaIssueNode } from "@/lib/graph-qa-ui";
import {
  getGraphTimeline,
  type GraphTimelineAction,
  type GraphTimelineEvent,
} from "@/lib/graph-timeline-api";
import { describeNextStepDecision } from "@/lib/next-step-tutor-ui";

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
  const [viewMode, setViewMode] = useState<KnowledgeGraphViewMode>("overview");
  const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([]);
  const [layoutOverrides, setLayoutOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [activeRemediation, setActiveRemediation] = useState<ActiveGraphRemediationSnapshot | null>(null);
  const [recommendation, setRecommendation] = useState<GraphRecommendation | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueEntrySnapshot[]>([]);
  const [nextStepDecision, setNextStepDecision] = useState<NextStepDecisionSnapshot | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeData | null>(null);
  const [qaReport, setQaReport] = useState<GraphQaReport | null>(null);
  const [qaDraft, setQaDraft] = useState<GraphQaDraft | null>(null);
  const [isMutatingQa, setIsMutatingQa] = useState<boolean>(false);
  const [timelineEvents, setTimelineEvents] = useState<GraphTimelineEvent[]>([]);
  const [timelineRequestKey, setTimelineRequestKey] = useState(0);
  const [timelineFocusedNodeId, setTimelineFocusedNodeId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const courseIdRef = useRef<string | null>(courseId);
  const currentNodeIdRef = useRef(currentNodeId);
  const dynamicNodesRef = useRef<DynamicKnowledgeGraphNode[]>(dynamicNodes);
  const expandedClusterIdsRef = useRef<string[]>(expandedClusterIds);
  const layoutOverridesRef = useRef<Record<string, { x: number; y: number }>>(layoutOverrides);
  const wsClientRef = useRef<UnifiedWSClient | null>(null);
  const wsSubscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  courseIdRef.current = courseId;
  currentNodeIdRef.current = currentNodeId;
  dynamicNodesRef.current = dynamicNodes;
  expandedClusterIdsRef.current = expandedClusterIds;
  layoutOverridesRef.current = layoutOverrides;

  const resolveNodeSuggestedFixes = useCallback((nodeId: string): GraphQaSuggestedFix[] => (
    (qaReport?.suggested_fixes ?? []).filter((fix) => {
      const issue = qaReport?.issues.find((item) => item.issue_id === fix.issue_id);
      return Boolean(issue?.affected_node_ids.includes(nodeId));
    })
  ), [qaReport]);

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

  const buildSelectedNodeData = useCallback((node: Node): SelectedNodeData => ({
      id: node.id,
      title: (node.data as Record<string, unknown>).label as string || node.id,
      description: (node.data as Record<string, unknown>).description as string || "",
      nodeType: (node.data as Record<string, unknown>).nodeType as string || "topic",
      difficulty: (node.data as Record<string, unknown>).difficulty as string || "medium",
      parentNodeId: (node.data as Record<string, unknown>).parentNodeId as string | undefined,
      hierarchyLevel: (node.data as Record<string, unknown>).hierarchyLevel as number | undefined,
      courseId: courseId ?? undefined,
      graphState: (node.data as Record<string, unknown>).graphState as string | undefined,
      hasUnmetPrerequisites: Boolean((node.data as Record<string, unknown>).hasUnmetPrerequisites),
      qaIssues: qaReport?.issues.filter((issue) => issue.affected_node_ids.includes(node.id)) ?? [],
      qaSuggestedFixes: resolveNodeSuggestedFixes(node.id),
  }), [courseId, qaReport, resolveNodeSuggestedFixes]);

  const selectNode = useCallback((node: Node) => {
    setSelectedNode(buildSelectedNodeData(node));
  }, [buildSelectedNodeData]);

  useEffect(() => {
    if (!selectedNode) return;
    const nextNode = nodes.find((node) => node.id === selectedNode.id);
    if (!nextNode) return;
    setSelectedNode((prev) => {
      if (!prev) return prev;
      const nextGraphState = (nextNode.data as Record<string, unknown>).graphState as string | undefined;
      const nextHasUnmetPrerequisites = Boolean(
        (nextNode.data as Record<string, unknown>).hasUnmetPrerequisites,
      );
      if (
        prev.graphState === nextGraphState &&
        prev.hasUnmetPrerequisites === nextHasUnmetPrerequisites
      ) {
        return prev;
      }
      return {
        ...prev,
        graphState: nextGraphState,
        hasUnmetPrerequisites: nextHasUnmetPrerequisites,
      };
    });
  }, [nodes, selectedNode]);

  const persistRuntimeState = useCallback((
    nextCurrentNodeId: string,
    nextDynamicNodes: DynamicKnowledgeGraphNode[],
    nextExpandedClusterIds: string[],
    nextLayoutOverrides: Record<string, { x: number; y: number }>,
  ) => {
    if (!courseId) return;
    writeStoredKnowledgeGraphState(courseId, {
      currentNodeId: nextCurrentNodeId,
      dynamicNodes: nextDynamicNodes,
      expandedClusterIds: nextExpandedClusterIds,
      layoutOverrides: nextLayoutOverrides,
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

  const refreshTimeline = useCallback(async (
    targetCourseId?: string | null,
    options: { category?: string; nodeId?: string; limit?: number } = {},
  ): Promise<GraphTimelineEvent[]> => {
    const resolvedCourseId = targetCourseId ?? courseId;
    if (!resolvedCourseId) {
      setTimelineEvents([]);
      return [];
    }
    const events = await getGraphTimeline(resolvedCourseId, options);
    setTimelineEvents(events);
    return events;
  }, [courseId]);

  const openTimeline = useCallback((nodeId = "") => {
    if (!courseId) return;
    setTimelineFocusedNodeId(nodeId);
    setTimelineRequestKey((value) => value + 1);
    void refreshTimeline(courseId, { nodeId, limit: 100 });
  }, [courseId, refreshTimeline]);

  const clearTimelineNodeFocus = useCallback(() => {
    if (!courseId) return;
    setTimelineFocusedNodeId("");
    void refreshTimeline(courseId, { limit: 100 });
  }, [courseId, refreshTimeline]);

  const selectNodeById = useCallback((nodeId: string) => {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target) return;
    selectNode(target);
    setCurrentNodeId(nodeId);
    persistRuntimeState(nodeId, dynamicNodes, expandedClusterIds, layoutOverrides);
  }, [dynamicNodes, expandedClusterIds, layoutOverrides, nodes, persistRuntimeState, selectNode]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    selectNode(node);
    setCurrentNodeId(node.id);
    persistRuntimeState(node.id, dynamicNodes, expandedClusterIds, layoutOverrides);
    if (sessionId && courseId) {
      void setCurrentGraphNode(sessionId, courseId, node.id).then((ok) => {
        if (ok) {
          void refreshRecommendation(courseId);
        }
      });
    }
  }, [courseId, dynamicNodes, expandedClusterIds, layoutOverrides, persistRuntimeState, refreshRecommendation, selectNode, sessionId]);

  const toggleCluster = useCallback((clusterId: string) => {
    setExpandedClusterIds((prev) => {
      const next = prev.includes(clusterId) ? prev.filter((id) => id !== clusterId) : [...prev, clusterId];
      persistRuntimeState(currentNodeId, dynamicNodes, next, layoutOverrides);
      return next;
    });
  }, [currentNodeId, dynamicNodes, layoutOverrides, persistRuntimeState]);

  const handleNodeDragStop = useCallback((_event: unknown, node: Node) => {
    setLayoutOverrides((prev) => {
      const next = {
        ...prev,
        [node.id]: { x: node.position.x, y: node.position.y },
      };
      persistRuntimeState(currentNodeId, dynamicNodes, expandedClusterIds, next);
      return next;
    });
  }, [currentNodeId, dynamicNodes, expandedClusterIds, persistRuntimeState]);

  const handleJumpToRecommended = useCallback((nodeId: string) => {
    selectNodeById(nodeId);
  }, [selectNodeById]);

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
        remediationState: activeRemediation
          ? {
              sourceNodeId: activeRemediation.source_node_id,
              targetNodeId: activeRemediation.target_node_id,
              status: activeRemediation.status,
            }
          : null,
      },
    );
    const styledNodes = flow.nodes.map((node) => styleNodeForProgress(node, currentProgress[node.id]));
    const clusterPositions = expandedClusterIds.reduce<Record<string, { x: number; y: number }>>((acc, clusterId) => {
      const parent = styledNodes.find((node) => node.id === clusterId);
      if (!parent) return acc;
      const childIds = styledNodes
        .filter((node) => (node.data as Record<string, unknown>).parentNodeId === clusterId)
        .map((node) => node.id);
      return {
        ...acc,
        ...buildClusterLayout({
          parentId: clusterId,
          parentPosition: parent.position,
          childIds,
          radius: 160,
        }),
      };
    }, {});

    const positionedNodes = styledNodes.map((node) => ({
      ...node,
      position: applyLayoutOverrides(
        { [node.id]: clusterPositions[node.id] ?? node.position },
        layoutOverrides,
      )[node.id] ?? node.position,
    }));
    const visibleNodes = filterVisibleFlowNodes(positionedNodes, viewMode, expandedClusterIds);
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = filterVisibleFlowEdges(flow.edges, visibleNodeIds);

    setNodes(visibleNodes);
    setEdges(visibleEdges);
  }, [activeRemediation, buildIssuesByNodeId, expandedClusterIds, layoutOverrides, qaReport, viewMode]);

  const refreshGraphQa = useCallback(async (targetCourseId: string) => {
    const report = await getGraphQaReport(targetCourseId).catch(() => null);
    setQaReport(report);
  }, []);

  const refreshGraphQaDraft = useCallback(async (targetCourseId: string) => {
    const draft = await getGraphQaDraft(targetCourseId).catch(() => null);
    setQaDraft(draft);
  }, []);

  const refreshCourseTemplate = useCallback(async (targetCourseId: string) => {
    const response = await fetch(apiUrl(`/api/v1/course-templates/${targetCourseId}`));
    if (!response.ok) {
      throw new Error("Failed to load course template");
    }
    setGraphTemplate(await response.json());
  }, []);

  const handleAnalyzeGraph = useCallback(() => {
    if (!courseId) return;
    setIsMutatingQa(true);
    void analyzeGraphQa(courseId)
      .then((report) => {
        setQaReport(report);
        void refreshGraphQaDraft(courseId);
      })
      .catch(() => {
        void refreshGraphQa(courseId);
      })
      .finally(() => {
        setIsMutatingQa(false);
      });
  }, [courseId, refreshGraphQa, refreshGraphQaDraft]);

  const handleApplyFix = useCallback((fixId: string) => {
    if (!courseId) return;
    setIsMutatingQa(true);
    void applyGraphQaFix(courseId, fixId)
      .then(async (report) => {
        setQaReport(report);
        await refreshCourseTemplate(courseId);
        await refreshGraphQaDraft(courseId);
        if (sessionId) {
          await refreshRecommendation(courseId);
        }
      })
      .catch(() => {
        void refreshGraphQa(courseId);
        void refreshGraphQaDraft(courseId);
      })
      .finally(() => {
        setIsMutatingQa(false);
      });
  }, [courseId, refreshCourseTemplate, refreshGraphQa, refreshGraphQaDraft, refreshRecommendation, sessionId]);

  const handleStageSafeFixes = useCallback(() => {
    if (!courseId || !qaReport) return;
    const safeFixIds = collectSafeBulkFixIds(qaReport.suggested_fixes);
    if (!safeFixIds.length) return;
    setIsMutatingQa(true);
    void stageGraphQaFixes(courseId, safeFixIds)
      .then((draft) => {
        setQaDraft(draft);
      })
      .catch(() => {
        void refreshGraphQaDraft(courseId);
      })
      .finally(() => {
        setIsMutatingQa(false);
      });
  }, [courseId, qaReport, refreshGraphQaDraft]);

  const handleCommitDraft = useCallback(() => {
    if (!courseId) return;
    setIsMutatingQa(true);
    void commitGraphQaDraft(courseId)
      .then(async (report) => {
        setQaReport(report);
        setQaDraft({ course_id: courseId, changes: [] });
        await refreshCourseTemplate(courseId);
        if (sessionId) {
          await refreshRecommendation(courseId);
        }
      })
      .catch(() => {
        void refreshGraphQa(courseId);
        void refreshGraphQaDraft(courseId);
      })
      .finally(() => {
        setIsMutatingQa(false);
      });
  }, [courseId, refreshCourseTemplate, refreshGraphQa, refreshGraphQaDraft, refreshRecommendation, sessionId]);

  const handleFocusIssue = useCallback((issue: GraphQaIssue) => {
    const targetNode = resolveGraphQaIssueNode(nodes, issue);
    if (!targetNode) return;
    selectNode(targetNode);
  }, [nodes, selectNode]);

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

  const launchNodeQuizById = useCallback((nodeId: string) => {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target) return;
    const nodeData = buildSelectedNodeData(target);
    setCurrentNodeId(nodeId);
    persistRuntimeState(nodeId, dynamicNodes, expandedClusterIds, layoutOverrides);
    updateNodeProgress(nodeId, "explored");
    onQuizNode?.(nodeData);
  }, [buildSelectedNodeData, dynamicNodes, expandedClusterIds, layoutOverrides, nodes, onQuizNode, persistRuntimeState, updateNodeProgress]);

  const handleTimelineAction = useCallback((action: GraphTimelineAction, event: GraphTimelineEvent) => {
    const nodeId = String(action.payload?.node_id ?? event.node_id ?? "");
    if (!nodeId) return;
    if (action.kind === "retry_quiz") {
      launchNodeQuizById(nodeId);
      return;
    }
    selectNodeById(nodeId);
  }, [launchNodeQuizById, selectNodeById]);

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
      : Promise.resolve({
          progress: {},
          current_node_id: "",
          dynamic_nodes: [],
          active_remediation: null,
          in_session_knowledge_state: null,
          next_step_decision: null,
        });
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
        setExpandedClusterIds(storedRuntimeState.expandedClusterIds);
        setLayoutOverrides(storedRuntimeState.layoutOverrides);
        setActiveRemediation(progressSnapshot.active_remediation ?? null);
        setReviewQueue(progressSnapshot.review_queue ?? []);
        setNextStepDecision(progressSnapshot.next_step_decision ?? null);
        persistRuntimeState(
          mergedRuntimeState.currentNodeId,
          mergedRuntimeState.dynamicNodes,
          storedRuntimeState.expandedClusterIds,
          storedRuntimeState.layoutOverrides,
        );
        setRecommendation(recommendationData);
      })
      .catch(console.error);
  }, [courseId, persistRuntimeState, sessionId]);

  useEffect(() => {
    if (!courseId) {
      setQaReport(null);
      setQaDraft(null);
      setTimelineEvents([]);
      return;
    }

    void refreshGraphQa(courseId);
    void refreshGraphQaDraft(courseId);
    void refreshTimeline(courseId, { limit: 100 });
  }, [courseId, refreshGraphQa, refreshGraphQaDraft, refreshTimeline]);

  useEffect(() => {
    if (!selectedNode?.id) return;
    setSelectedNode((prev) => {
      if (!prev) return prev;
      const qaIssues = qaReport?.issues.filter((issue) => issue.affected_node_ids.includes(prev.id)) ?? [];
      const qaSuggestedFixes = resolveNodeSuggestedFixes(prev.id);
      const prevIssueIds = (prev.qaIssues ?? []).map((issue) => issue.issue_id).join("|");
      const nextIssueIds = qaIssues.map((issue) => issue.issue_id).join("|");
      const prevFixIds = (prev.qaSuggestedFixes ?? []).map((fix) => fix.fix_id).join("|");
      const nextFixIds = qaSuggestedFixes.map((fix) => fix.fix_id).join("|");
      if (prevIssueIds === nextIssueIds && prevFixIds === nextFixIds) {
        return prev;
      }
      return {
        ...prev,
        qaIssues,
        qaSuggestedFixes,
      };
    });
  }, [qaReport, resolveNodeSuggestedFixes, selectedNode?.id]);

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

    let isActive = true;
    const client = new UnifiedWSClient((event: StreamEvent) => {
      if (event.type === "result" && event.metadata?.event_type === "graph_updated") {
        const state = event.metadata.state as GraphStatePayload;
        if (!state) return;

        const nextCurrentNodeId = state.current_node_id || currentNodeIdRef.current;
        const nextDynamicNodes = state.dynamic_nodes ?? [];
        setCurrentNodeId(nextCurrentNodeId);
        setDynamicNodes(nextDynamicNodes);
        persistRuntimeState(
          nextCurrentNodeId,
          nextDynamicNodes,
          expandedClusterIdsRef.current,
          layoutOverridesRef.current,
        );
        if (courseIdRef.current) {
          void refreshRecommendation(courseIdRef.current);
        }
      }
    });

    wsClientRef.current = client;
    client.connect();

    wsSubscribeTimerRef.current = setTimeout(() => {
      if (isActive && client.connected) {
        client.send({ type: "subscribe_session", session_id: sessionId });
      }
    }, 500);

    return () => {
      isActive = false;
      if (wsSubscribeTimerRef.current) {
        clearTimeout(wsSubscribeTimerRef.current);
        wsSubscribeTimerRef.current = null;
      }
      if (wsClientRef.current === client) {
        wsClientRef.current = null;
      }
      client.disconnect();
    };
  }, [persistRuntimeState, refreshRecommendation, sessionId]);

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
        setActiveRemediation(progressSnapshot.active_remediation ?? null);
        setReviewQueue(progressSnapshot.review_queue ?? []);
        setNextStepDecision(progressSnapshot.next_step_decision ?? null);
        persistRuntimeState(
          progressSnapshot.current_node_id || detail.node_id || "",
          progressSnapshot.dynamic_nodes ?? [],
          expandedClusterIds,
          layoutOverrides,
        );
      });
      void refreshRecommendation(courseId);
      void refreshTimeline(courseId, {
        nodeId: timelineFocusedNodeId || detail.node_id || "",
        limit: 100,
      });
    };

    window.addEventListener("deeptutor:graph-quiz-updated", handleGraphQuizUpdated as EventListener);

    const handleOpenLearningTimeline = (event: Event) => {
      const detail = (event as CustomEvent<{ course_id?: string; node_id?: string }>).detail;
      if (!detail || detail.course_id !== courseId) return;
      openTimeline(detail.node_id || "");
    };

    window.addEventListener(
      "deeptutor:open-learning-timeline",
      handleOpenLearningTimeline as EventListener,
    );
    return () => {
      window.removeEventListener("deeptutor:graph-quiz-updated", handleGraphQuizUpdated as EventListener);
      window.removeEventListener(
        "deeptutor:open-learning-timeline",
        handleOpenLearningTimeline as EventListener,
      );
    };
  }, [
    courseId,
    expandedClusterIds,
    layoutOverrides,
    openTimeline,
    persistRuntimeState,
    refreshRecommendation,
    refreshTimeline,
    sessionId,
    timelineFocusedNodeId,
  ]);

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
          <button
            onClick={() => openTimeline(recommendation.recommended_node_id || "")}
            className="mt-2 text-[11px] font-medium text-blue-700 underline underline-offset-2"
          >
            {getGraphRecommendationTimelineCtaLabel(recommendation)}
          </button>
        </div>
      ) : null}
      {nextStepDecision ? (
        <div className="absolute top-52 left-4 z-10 w-72 rounded-xl border border-sky-200 bg-white/95 p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">
            {describeNextStepDecision(nextStepDecision).badge}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {describeNextStepDecision(nextStepDecision).summary}
          </p>
        </div>
      ) : null}
      {reviewQueue.length ? (
        <section className="absolute top-84 left-4 z-10 w-72 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                Review Queue
              </div>
              <p className="mt-1 text-xs leading-relaxed text-amber-950">
                Một vài node nên ôn lại lúc này để tránh quên hoặc bị kẹt ở bước tiếp theo.
              </p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-800">
              {reviewQueue.length}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {reviewQueue.map((entry) => (
              <button
                key={entry.node_id}
                onClick={() => openTimeline(entry.node_id)}
                className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-white px-3 py-2 text-left transition-colors hover:bg-amber-100/60"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{entry.node_id}</div>
                  <div className="mt-1 text-xs text-slate-600">{entry.review_mode}</div>
                </div>
                <div className="text-xs font-semibold text-amber-800">
                  {Math.round(entry.score * 100)}%
                </div>
              </button>
            ))}
          </div>
        </section>
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
        busy={isMutatingQa}
        onAnalyze={handleAnalyzeGraph}
        onFocusIssue={handleFocusIssue}
        onApplyFix={handleApplyFix}
        onStageSafeFixes={handleStageSafeFixes}
        onCommitDraft={handleCommitDraft}
      />
      <LearningTimelineDrawer
        events={timelineEvents}
        requestKey={timelineRequestKey}
        focusedNodeId={timelineFocusedNodeId}
        onClearNodeFocus={clearTimelineNodeFocus}
        onAction={handleTimelineAction}
        onSelectNode={selectNodeById}
      />
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setViewMode("overview")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setViewMode("expanded")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          Expanded
        </button>
        {selectedNode ? (
          <button
            type="button"
            onClick={() => toggleCluster(selectedNode.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            {expandedClusterIds.includes(selectedNode.id) ? "Thu gon cum" : "Mo cum"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setLayoutOverrides({})}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          Reset layout
        </button>
      </div>
      <ReactFlow nodes={nodes} edges={edges} onNodeClick={handleNodeClick} onNodeDragStop={handleNodeDragStop} fitView>
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
        nextStepDecision={nextStepDecision ? {
          badge: describeNextStepDecision(nextStepDecision).badge,
          ctaLabel: describeNextStepDecision(nextStepDecision).ctaLabel,
          message: describeNextStepDecision(nextStepDecision).summary,
          targetNodeId: nextStepDecision.target_node_id,
        } : undefined}
        qaIssues={selectedNode?.qaIssues ?? []}
        onApplyQaFix={(fixId) => {
          handleApplyFix(fixId);
        }}
        onClose={() => setSelectedNode(null)}
        onJumpToRecommended={handleJumpToRecommended}
        onOpenTimeline={openTimeline}
        onAskAbout={(n) => {
          setSelectedNode(null);
          setCurrentNodeId(n.id);
          persistRuntimeState(n.id, dynamicNodes, expandedClusterIds, layoutOverrides);
          updateNodeProgress(n.id, "explored");
          onAskAbout?.(n);
        }}
        onQuizNode={(n) => {
          setSelectedNode(null);
          setCurrentNodeId(n.id);
          persistRuntimeState(n.id, dynamicNodes, expandedClusterIds, layoutOverrides);
          updateNodeProgress(n.id, "explored");
          onQuizNode?.(n);
        }}
      />
    </div>
  );
}
