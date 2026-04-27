import React, { useCallback, useEffect, useState, useRef } from "react";
import { ReactFlow, Background, Controls, Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import NodeDetailPanel, { type SelectedNodeData } from "./NodeDetailPanel";
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
import { describeCourseTemplateImport } from "@/lib/course-template-import-feedback";
import { getNodeProgress, markNodeProgress, type NodeStatus } from "@/lib/node-progress-api";
import { getGraphRecommendation, type GraphRecommendation } from "@/lib/graph-recommendation-api";
import { describeGraphRecommendation } from "@/lib/graph-recommendation-ui";

const DEFAULT_NODES: Node[] = [
  { id: "1", position: { x: 250, y: 50 }, data: { label: "Chapter 1: Intro" }, type: "default" },
  { id: "2", position: { x: 250, y: 200 }, data: { label: "Chapter 2: Vars" }, type: "default" },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e1-2", source: "1", target: "2" },
];

interface DynamicNode {
  node_id: string;
  title: string;
  node_type: string;
  dependencies: string[];
}

interface GraphStatePayload {
  current_node_id: string;
  mastered_nodes: string[];
  dynamic_nodes: DynamicNode[];
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
  const [courseId, setCourseId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, NodeStatus>>({});
  const [recommendation, setRecommendation] = useState<GraphRecommendation | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode({
      id: node.id,
      title: (node.data as Record<string, unknown>).label as string || node.id,
      description: (node.data as Record<string, unknown>).description as string || "",
      nodeType: (node.data as Record<string, unknown>).nodeType as string || "topic",
      difficulty: (node.data as Record<string, unknown>).difficulty as string || "medium",
    });
  }, []);

  const handleJumpToRecommended = useCallback((nodeId: string) => {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target) return;
    setSelectedNode({
      id: target.id,
      title: (target.data as Record<string, unknown>).label as string || target.id,
      description: (target.data as Record<string, unknown>).description as string || "",
      nodeType: (target.data as Record<string, unknown>).nodeType as string || "topic",
      difficulty: (target.data as Record<string, unknown>).difficulty as string || "medium",
    });
  }, [nodes]);

  const applyCourseTemplate = useCallback((
    data: { nodes?: any[]; edges?: any[] },
    currentProgress: Record<string, NodeStatus>,
    recommendedNodeId?: string | null,
  ) => {
    if (!data || !data.nodes) return;
    const flow = mapCourseKnowledgeGraphToFlow(data as any, { recommendedNodeId });
    
    // Apply progress styling
    const styledNodes = flow.nodes.map(node => {
      const status = currentProgress[node.id];
      if (status === "mastered") {
        return {
          ...node,
          style: { ...node.style, border: "2px solid #22c55e", boxShadow: "0 0 10px rgba(34, 197, 94, 0.2)" }
        };
      } else if (status === "explored") {
        return {
          ...node,
          style: { ...node.style, border: "2px solid #f59e0b" }
        };
      }
      return node;
    });

    setNodes(styledNodes);
    setEdges(flow.edges);
  }, []);

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
      : Promise.resolve({});
    const recommendationPromise = shouldLoadProgress && sessionId
      ? getGraphRecommendation(sessionId, courseId)
      : Promise.resolve(null);

    Promise.all([templatePromise, progressPromise, recommendationPromise])
      .then(([templateData, progressData, recommendationData]) => {
        setProgressMap(progressData as Record<string, NodeStatus>);
        setRecommendation(recommendationData);
        applyCourseTemplate(
          templateData,
          progressData as Record<string, NodeStatus>,
          recommendationData?.recommended_node_id ?? null,
        );
      })
      .catch(console.error);
  }, [courseId, sessionId, applyCourseTemplate]);

  useEffect(() => {
    if (!sessionId) return;
    
    let isConnected = true;
    const client = new UnifiedWSClient((event: StreamEvent) => {
      // The push_custom_event emits a RESULT event with event_type = "graph_updated"
      if (event.type === "result" && event.metadata?.event_type === "graph_updated") {
        const state = event.metadata.state as GraphStatePayload;
        if (!state) return;
        
        setNodes(prevNodes => {
          const newNodes = [...prevNodes];
          state.dynamic_nodes?.forEach((dynNode, idx: number) => {
            const sqId = dynNode.node_id;
            if (!newNodes.find(n => n.id === sqId)) {
              newNodes.push({
                id: sqId,
                position: { x: 450, y: 125 + (idx * 100) }, 
                data: { label: dynNode.title },
                type: "default",
                style: { border: "2px solid red", borderRadius: "8px", padding: "10px" }
              });
            }
          });
          return newNodes;
        });

        setEdges(prevEdges => {
          const newEdges = [...prevEdges];
          state.dynamic_nodes?.forEach((dynNode) => {
            const sqId = dynNode.node_id;
            dynNode.dependencies?.forEach((depId: string) => {
              const edgeId = `e-${depId}-${sqId}`;
              if (!newEdges.find(e => e.id === edgeId)) {
                newEdges.push({
                  id: edgeId,
                  source: depId,
                  target: sqId,
                  animated: true,
                  style: { stroke: "red", strokeWidth: 2 }
                });
              }
            });
          });
          return newEdges;
        });
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
  }, [sessionId]);

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
          {isExtracting ? "Extracting AI Graph..." : "Import Syllabus"}
        </button>
      </div>
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
        onClose={() => setSelectedNode(null)}
        onJumpToRecommended={handleJumpToRecommended}
        onAskAbout={(n) => {
          setSelectedNode(null);
          if (sessionId && courseId) {
            void markNodeProgress(sessionId, courseId, n.id, "explored");
            setProgressMap(prev => ({ ...prev, [n.id]: "explored" }));
            setNodes(prevNodes => prevNodes.map(node => node.id === n.id 
              ? { ...node, style: { ...node.style, border: "2px solid #f59e0b" } } 
              : node
            ));
          }
          onAskAbout?.(n);
        }}
        onQuizNode={(n) => {
          setSelectedNode(null);
          if (sessionId && courseId) {
            void markNodeProgress(sessionId, courseId, n.id, "mastered");
            setProgressMap(prev => ({ ...prev, [n.id]: "mastered" }));
            setNodes(prevNodes => prevNodes.map(node => node.id === n.id 
              ? { ...node, style: { ...node.style, border: "2px solid #22c55e", boxShadow: "0 0 10px rgba(34, 197, 94, 0.2)" } } 
              : node
            ));
          }
          onQuizNode?.(n);
        }}
      />
    </div>
  );
}
