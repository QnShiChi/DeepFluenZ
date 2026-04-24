const KNOWLEDGE_GRAPH_COURSE_STORAGE_KEY = "deeptutor.knowledgeGraph.courseId";

export interface KnowledgeGraphSessionPreferences {
  course_id?: string;
}

export function resolveKnowledgeGraphCourseId(
  preferences?: KnowledgeGraphSessionPreferences,
  storedCourseId?: string | null,
): string | null {
  const sessionCourseId = preferences?.course_id?.trim();
  if (sessionCourseId) return sessionCourseId;
  const fallbackCourseId = storedCourseId?.trim();
  return fallbackCourseId || null;
}

export function readStoredKnowledgeGraphCourseId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KNOWLEDGE_GRAPH_COURSE_STORAGE_KEY);
}

export function writeStoredKnowledgeGraphCourseId(courseId: string | null): void {
  if (typeof window === "undefined") return;
  if (courseId) {
    window.localStorage.setItem(KNOWLEDGE_GRAPH_COURSE_STORAGE_KEY, courseId);
    return;
  }
  window.localStorage.removeItem(KNOWLEDGE_GRAPH_COURSE_STORAGE_KEY);
}
