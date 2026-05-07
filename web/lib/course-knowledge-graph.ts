export interface CourseKnowledgeGraphNode {
  node_id?: string;
  title: string;
  node_type: "topic" | "concept" | "skill" | "application" | "lesson" | "subtopic";
  description?: string;
  difficulty?: string;
  hierarchy_level?: number;
  parent_node_id?: string;
  ordinal?: string;
  source_label?: string;
  source_path?: string[];
  layout_group_id?: string;
  layout_priority?: number;
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

export interface CourseKnowledgeGraphNodeIssue {
  severity: "critical" | "high" | "medium" | "low";
  kind: string;
}

export type GraphNodeProgressState =
  | "mastered"
  | "explored"
  | "in_progress"
  | "needs_remediation"
  | "locked"
  | "available";

export type KnowledgeGraphViewMode = "overview" | "expanded";

export interface KnowledgeGraphVisibilityState {
  backboneNodeIds: string[];
  visibleExpandedParentIds: string[];
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

export function buildKnowledgeGraphVisibilityState(
  graph: CourseKnowledgeGraph,
  expandedLessonIds: string[],
): KnowledgeGraphVisibilityState {
  const backboneNodeIds = graph.nodes
    .filter((node) => (node.hierarchy_level ?? 0) === 0)
    .map((node) => String(node.node_id ?? ""))
    .filter(Boolean);

  const allowedParents = new Set(backboneNodeIds);

  return {
    backboneNodeIds,
    visibleExpandedParentIds: expandedLessonIds.filter((id) => allowedParents.has(id)),
  };
}

export function resolveExpandedClusterIdsOnNodeClick(
  nodes: Array<{
    node_id?: string;
    parent_node_id?: string;
  }>,
  expandedClusterIds: string[],
  clickedNodeId: string,
): string[] {
  const hasChildren = nodes.some((node) => String(node.parent_node_id ?? "") === clickedNodeId);
  if (!hasChildren || expandedClusterIds.includes(clickedNodeId)) {
    return expandedClusterIds;
  }
  return [...expandedClusterIds, clickedNodeId];
}

export function mapCourseKnowledgeGraphToFlow(
  graph: CourseKnowledgeGraph,
  options?: {
    recommendedNodeId?: string | null;
    currentNodeId?: string | null;
    progressMap?: Record<string, "explored" | "mastered">;
    issuesByNodeId?: Record<string, CourseKnowledgeGraphNodeIssue[]>;
    remediationState?: {
      sourceNodeId: string;
      targetNodeId: string;
      status: string;
    } | null;
  },
) {
  const seenNodeIds = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const recommendedNodeId = options?.recommendedNodeId ?? null;
  const currentNodeId = options?.currentNodeId ?? null;
  const progressMap = options?.progressMap ?? {};
  const issuesByNodeId = options?.issuesByNodeId ?? {};
  const remediationState = options?.remediationState ?? null;
  const prerequisites = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (edge.relation_type !== "prerequisite") continue;
    const current = prerequisites.get(edge.target) ?? new Set<string>();
    current.add(edge.source);
    prerequisites.set(edge.target, current);
  }

  const nodes = graph.nodes.map((node, index) => {
    const id = ensureUniqueId(node.node_id, seenNodeIds, "node", index);
    const nodeIssues = issuesByNodeId[id] ?? [];
    const issueSeverity = nodeIssues[0]?.severity;
    const isRecommended = id === recommendedNodeId;
    const status = progressMap[id];
    const prereqIds = prerequisites.get(id) ?? new Set<string>();
    const hasUnmetPrerequisites = [...prereqIds].some((prereqId) => progressMap[prereqId] !== "mastered");
    const isRemediationTarget = remediationState?.targetNodeId === id;
    const graphState: GraphNodeProgressState =
      status === "mastered"
        ? "mastered"
        : isRemediationTarget
          ? "needs_remediation"
        : currentNodeId === id
          ? "in_progress"
          : status === "explored"
            ? "explored"
            : hasUnmetPrerequisites
              ? "locked"
              : "available";

    const baseStyle =
      graphState === "locked"
        ? {
            opacity: 0.55,
            background: "#e5e7eb",
            color: "#64748b",
          }
        : graphState === "needs_remediation"
          ? {
              border: "2px solid #e11d48",
              boxShadow: "0 0 0 4px rgba(225, 29, 72, 0.12)",
            }
        : graphState === "in_progress"
          ? {
              border: "2px solid #0ea5e9",
              boxShadow: "0 0 0 4px rgba(14, 165, 233, 0.14)",
            }
          : undefined;

    return {
      id,
      position: {
        x: node.node_type === "topic" || node.node_type === "lesson" ? 250 : 520,
        y: 60 + index * 120,
      },
      data: {
        label: node.title,
        description: node.description ?? "",
        nodeType: node.node_type,
        hierarchyLevel: node.hierarchy_level ?? 0,
        parentNodeId: node.parent_node_id ?? "",
        ordinal: node.ordinal ?? "",
        sourceLabel: node.source_label ?? "",
        sourcePath: node.source_path ?? [],
        layoutGroupId: node.layout_group_id ?? node.parent_node_id ?? id,
        layoutPriority: node.layout_priority ?? 0,
        difficulty: node.difficulty ?? "medium",
        issueSeverity,
        issueCount: nodeIssues.length,
        isRecommended,
        graphState,
        hasUnmetPrerequisites,
      },
      type: "default",
      style: isRecommended
        ? {
            ...baseStyle,
            border: "3px solid #3b82f6",
            boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.15)",
          }
        : baseStyle,
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

export function filterVisibleFlowNodes<T extends {
  id: string;
  data?: {
    parentNodeId?: string;
  };
}>(
  nodes: T[],
  viewMode: KnowledgeGraphViewMode,
  expandedClusterIds: string[],
): T[] {
  if (viewMode === "expanded") {
    const expanded = new Set(expandedClusterIds);
    return nodes.filter((node) => {
      const parentNodeId = node.data?.parentNodeId ?? "";
      return !parentNodeId || expanded.has(parentNodeId);
    });
  }
  return nodes.filter((node) => !(node.data?.parentNodeId ?? ""));
}

export function filterVisibleFlowEdges<T extends {
  source: string;
  target: string;
}>(
  edges: T[],
  visibleNodeIds: Set<string>,
): T[] {
  return edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
}
