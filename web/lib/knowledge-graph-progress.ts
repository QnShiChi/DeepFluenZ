const KNOWLEDGE_GRAPH_PROGRESS_STORAGE_PREFIX = "deeptutor.knowledgeGraph.progress.";

export type KnowledgeGraphProgressStatus = "explored" | "mastered";

export function mergeKnowledgeGraphProgress(
  persisted: Record<string, KnowledgeGraphProgressStatus>,
  remote: Record<string, KnowledgeGraphProgressStatus>,
): Record<string, KnowledgeGraphProgressStatus> {
  const merged = { ...persisted, ...remote };

  for (const [nodeId, status] of Object.entries(persisted)) {
    if (status === "mastered") {
      merged[nodeId] = "mastered";
    }
  }

  return merged;
}

export function readStoredKnowledgeGraphProgress(
  courseId: string | null | undefined,
): Record<string, KnowledgeGraphProgressStatus> {
  if (typeof window === "undefined" || !courseId) return {};
  try {
    const raw = window.localStorage.getItem(`${KNOWLEDGE_GRAPH_PROGRESS_STORAGE_PREFIX}${courseId}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, KnowledgeGraphProgressStatus>;
  } catch {
    return {};
  }
}

export function writeStoredKnowledgeGraphProgress(
  courseId: string | null | undefined,
  progress: Record<string, KnowledgeGraphProgressStatus>,
): void {
  if (typeof window === "undefined" || !courseId) return;
  window.localStorage.setItem(
    `${KNOWLEDGE_GRAPH_PROGRESS_STORAGE_PREFIX}${courseId}`,
    JSON.stringify(progress),
  );
}

export function clearStoredKnowledgeGraphProgress(courseId: string | null | undefined): void {
  if (typeof window === "undefined" || !courseId) return;
  window.localStorage.removeItem(`${KNOWLEDGE_GRAPH_PROGRESS_STORAGE_PREFIX}${courseId}`);
}
