import React, { useEffect, useRef, useState } from "react";
import { Background, Controls, Edge, Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { apiUrl } from "@/lib/api";
import { mapCourseKnowledgeGraphToFlow } from "@/lib/course-knowledge-graph";
import { UnifiedWSClient, StreamEvent } from "@/lib/unified-ws";

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

export default function KnowledgeGraphViewer({ sessionId }: { sessionId?: string }) {
  const [nodes, setNodes] = useState<Node[]>(DEFAULT_NODES);
  const [edges, setEdges] = useState<Edge[]>(DEFAULT_EDGES);
  const [courseId, setCourseId] = useState<string>("test-course-import-1");
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          alert("Course template extracted and imported successfully!");
          setCourseId(resData.course_id);
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
          alert("Course template imported successfully!");
          setCourseId(resData.course_id);
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
    if (!courseId) return;
    fetch(apiUrl(`/api/v1/course-templates/${courseId}`))
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.nodes) return;
        const flow = mapCourseKnowledgeGraphToFlow(data);
        setNodes(flow.nodes);
        setEdges(flow.edges);
      })
      .catch(console.error);
  }, [courseId]);

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
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
