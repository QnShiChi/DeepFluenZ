import type { DynamicKnowledgeGraphNode } from "./node-progress-api";

const KNOWLEDGE_GRAPH_STATE_STORAGE_PREFIX = "deeptutor.knowledgeGraph.state.";

export interface StoredKnowledgeGraphState {
  currentNodeId: string;
  dynamicNodes: DynamicKnowledgeGraphNode[];
  expandedClusterIds: string[];
  layoutOverrides: Record<string, { x: number; y: number }>;
}

export function readStoredKnowledgeGraphState(
  courseId: string | null | undefined,
): StoredKnowledgeGraphState {
  if (typeof window === "undefined" || !courseId) {
    return { currentNodeId: "", dynamicNodes: [], expandedClusterIds: [], layoutOverrides: {} };
  }
  try {
    const raw = window.localStorage.getItem(`${KNOWLEDGE_GRAPH_STATE_STORAGE_PREFIX}${courseId}`);
    if (!raw) return { currentNodeId: "", dynamicNodes: [], expandedClusterIds: [], layoutOverrides: {} };
    const parsed = JSON.parse(raw) as Partial<StoredKnowledgeGraphState>;
    return {
      currentNodeId: typeof parsed.currentNodeId === "string" ? parsed.currentNodeId : "",
      dynamicNodes: Array.isArray(parsed.dynamicNodes)
        ? parsed.dynamicNodes as DynamicKnowledgeGraphNode[]
        : [],
      expandedClusterIds: Array.isArray(parsed.expandedClusterIds)
        ? parsed.expandedClusterIds.filter((item): item is string => typeof item === "string")
        : [],
      layoutOverrides:
        parsed.layoutOverrides && typeof parsed.layoutOverrides === "object"
          ? parsed.layoutOverrides as Record<string, { x: number; y: number }>
          : {},
    };
  } catch {
    return { currentNodeId: "", dynamicNodes: [], expandedClusterIds: [], layoutOverrides: {} };
  }
}

export function writeStoredKnowledgeGraphState(
  courseId: string | null | undefined,
  state: StoredKnowledgeGraphState,
): void {
  if (typeof window === "undefined" || !courseId) return;
  window.localStorage.setItem(
    `${KNOWLEDGE_GRAPH_STATE_STORAGE_PREFIX}${courseId}`,
    JSON.stringify(state),
  );
}
