export interface CourseKnowledgeGraphNode {
  node_id?: string;
  title: string;
  node_type: "topic" | "concept" | "skill" | "application";
  description?: string;
  difficulty?: string;
}

export interface CourseKnowledgeGraphEdge {
  edge_id?: string;
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

function ensureUniqueId(
  baseId: string | null | undefined,
  seenIds: Set<string>,
  fallbackPrefix: string,
  index: number,
): string {
  const normalizedBase =
    (typeof baseId === "string" ? baseId.trim() : "") || `${fallbackPrefix}-${index}`;
  let candidate = normalizedBase;
  let suffix = 1;

  while (seenIds.has(candidate)) {
    candidate = `${normalizedBase}__${suffix}`;
    suffix += 1;
  }

  seenIds.add(candidate);
  return candidate;
}

export function mapCourseKnowledgeGraphToFlow(
  graph: CourseKnowledgeGraph,
  options?: { recommendedNodeId?: string | null },
) {
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const recommendedNodeId = options?.recommendedNodeId ?? null;

  const nodes = graph.nodes.map((node, index) => {
    const id = ensureUniqueId(node.node_id, seenNodeIds, "node", index);
    const isRecommended = id === recommendedNodeId;
    return {
      id,
      position: {
        x: node.node_type === "topic" ? 250 : 520,
        y: 60 + index * 120,
      },
      data: {
        label: node.title,
        description: node.description ?? "",
        nodeType: node.node_type,
        difficulty: node.difficulty ?? "medium",
        isRecommended,
      },
      type: "default",
      style: isRecommended
        ? {
            border: "3px solid #3b82f6",
            boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.15)",
          }
        : undefined,
    };
  });

  const edges = graph.edges.map((edge, index) => {
    const id = ensureUniqueId(edge.edge_id, seenEdgeIds, "edge", index);
    return {
      id,
      source: edge.source,
      target: edge.target,
      label: edge.relation_type,
      animated: edge.relation_type === "related_to",
    };
  });

  return { nodes, edges };
}
