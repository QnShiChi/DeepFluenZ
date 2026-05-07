import type {
  CourseKnowledgeGraph,
  CourseKnowledgeGraphNodeIssue,
  GraphNodeProgressState,
} from "./course-knowledge-graph.ts";
import { buildKnowledgeGraphVisibilityState } from "./course-knowledge-graph.ts";

export interface CytoscapeNodeElement {
  data: {
    id: string;
    label: string;
    kind: string;
    parentId: string;
    hierarchyLevel: number;
    ordinal: string;
    graphState: GraphNodeProgressState;
    issueSeverity: CourseKnowledgeGraphNodeIssue["severity"] | null;
    issueCount: number;
    isExpanded: boolean;
    isRecommended: boolean;
    isCurrent: boolean;
    isVisibleInOverview: boolean;
    isVisibleInExpanded: boolean;
  };
  classes: string;
}

export interface CytoscapeEdgeElement {
  data: {
    id: string;
    source: string;
    target: string;
    relationType: string;
    isVisibleInOverview: boolean;
    isVisibleInExpanded: boolean;
  };
  classes: string;
}

export interface CytoscapeKnowledgeGraphMapOptions {
  expandedLessonIds: string[];
  currentNodeId?: string | null;
  recommendedNodeId?: string | null;
  progressMap?: Partial<Record<string, "explored" | "mastered">>;
  issuesByNodeId?: Record<string, CourseKnowledgeGraphNodeIssue[]>;
  remediationState?: {
    sourceNodeId: string;
    targetNodeId: string;
    status: string;
  } | null;
}

function joinClasses(values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function mapCourseKnowledgeGraphToCytoscape(
  graph: CourseKnowledgeGraph,
  options: CytoscapeKnowledgeGraphMapOptions,
): { nodes: CytoscapeNodeElement[]; edges: CytoscapeEdgeElement[] } {
  const currentNodeId = options.currentNodeId ?? null;
  const recommendedNodeId = options.recommendedNodeId ?? null;
  const progressMap = options.progressMap ?? {};
  const issuesByNodeId = options.issuesByNodeId ?? {};
  const remediationState = options.remediationState ?? null;
  const visibility = buildKnowledgeGraphVisibilityState(graph, options.expandedLessonIds);
  const backboneIds = new Set(visibility.backboneNodeIds);
  const expandedIds = new Set(visibility.visibleExpandedParentIds);
  const prerequisites = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (edge.relation_type !== "prerequisite") continue;
    const current = prerequisites.get(edge.target) ?? new Set<string>();
    current.add(edge.source);
    prerequisites.set(edge.target, current);
  }

  const nodes = graph.nodes.map((node) => {
    const id = String(node.node_id ?? "");
    const parentId = node.parent_node_id ?? "";
    const issueList = issuesByNodeId[id] ?? [];
    const issueSeverity = issueList[0]?.severity ?? null;
    const prerequisiteIds = prerequisites.get(id) ?? new Set<string>();
    const hasUnmetPrerequisites = [...prerequisiteIds].some((prereqId) => progressMap[prereqId] !== "mastered");
    const isRemediationTarget = remediationState?.targetNodeId === id;
    const isBackbone = backboneIds.has(id);
    const isVisibleInOverview = isBackbone;
    const isVisibleInExpanded = isBackbone || expandedIds.has(parentId);
    const graphState: GraphNodeProgressState =
      progressMap[id] === "mastered"
        ? "mastered"
        : isRemediationTarget
          ? "needs_remediation"
          : currentNodeId === id
            ? "in_progress"
            : progressMap[id] === "explored"
              ? "explored"
              : hasUnmetPrerequisites
                ? "locked"
                : "available";

    return {
      data: {
        id,
        label: node.title,
        kind: node.node_type,
        parentId,
        hierarchyLevel: node.hierarchy_level ?? 0,
        ordinal: node.ordinal ?? "",
        graphState,
        issueSeverity,
        issueCount: issueList.length,
        isExpanded: expandedIds.has(id),
        isRecommended: recommendedNodeId === id,
        isCurrent: currentNodeId === id,
        isVisibleInOverview,
        isVisibleInExpanded,
      },
      classes: joinClasses([
        `kind-${node.node_type}`,
        (node.hierarchy_level ?? 0) === 0 ? "level-backbone" : "level-child",
        currentNodeId === id && "is-current",
        recommendedNodeId === id && "is-recommended",
        expandedIds.has(id) && "is-expanded",
        isRemediationTarget && "is-remediation-target",
        `state-${graphState}`,
        issueSeverity && `issue-${issueSeverity}`,
      ]),
    };
  });

  const visibleNodeIdsForOverview = new Set(nodes.filter((node) => node.data.isVisibleInOverview).map((node) => node.data.id));
  const visibleNodeIdsForExpanded = new Set(nodes.filter((node) => node.data.isVisibleInExpanded).map((node) => node.data.id));

  const edges = graph.edges.map((edge, index) => {
    const id = edge.edge_id?.trim() ? edge.edge_id : `edge-${index}`;
    return {
      data: {
        id,
        source: edge.source,
        target: edge.target,
        relationType: edge.relation_type,
        isVisibleInOverview:
          visibleNodeIdsForOverview.has(edge.source) && visibleNodeIdsForOverview.has(edge.target),
        isVisibleInExpanded:
          visibleNodeIdsForExpanded.has(edge.source) && visibleNodeIdsForExpanded.has(edge.target),
      },
      classes: joinClasses([
        `relation-${edge.relation_type}`,
        edge.relation_type === "prerequisite" && "is-directional",
      ]),
    };
  });

  return { nodes, edges };
}
