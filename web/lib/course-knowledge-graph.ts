export interface CourseKnowledgeGraphNode {
  node_id: string;
  title: string;
  node_type: "topic" | "concept" | "skill" | "application";
  description?: string;
  difficulty?: string;
}

export interface CourseKnowledgeGraphEdge {
  edge_id: string;
  source: string;
  target: string;
  relation_type: string;
  confidence?: number;
}

export interface CourseKnowledgeGraph {
  course_id: string;
  title: string;
  source_type: string;
  nodes: CourseKnowledgeGraphNode[];
  edges: CourseKnowledgeGraphEdge[];
  audit: {
    backbone_node_ids: string[];
    enriched_node_ids: string[];
    backbone_edge_ids: string[];
    enriched_edge_ids: string[];
    warnings: string[];
  };
}

export function mapCourseKnowledgeGraphToFlow(graph: CourseKnowledgeGraph) {
  const nodes = graph.nodes.map((node, index) => ({
    id: node.node_id,
    position: {
      x: node.node_type === "topic" ? 250 : 520,
      y: 60 + index * 120,
    },
    data: {
      label: node.title,
      nodeType: node.node_type,
      difficulty: node.difficulty ?? "medium",
    },
    type: "default",
  }));

  const edges = graph.edges.map((edge) => ({
    id: edge.edge_id,
    source: edge.source,
    target: edge.target,
    label: edge.relation_type,
    animated: edge.relation_type === "related_to",
  }));

  return { nodes, edges };
}
