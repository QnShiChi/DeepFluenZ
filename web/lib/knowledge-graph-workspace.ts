export type KnowledgeGraphRailMode = "summary" | "chat" | "quiz";
export type KnowledgeGraphRailAction = "idle" | "chat" | "quiz" | "close-action";

export interface KnowledgeGraphWorkspaceState {
  showOverviewGraph: boolean;
  showFocusInset: boolean;
  focusClusterId: string | null;
  railMode: KnowledgeGraphRailMode;
}

export function buildWorkspaceState(input: {
  activeClusterId: string | null;
  selectedNodeId: string | null;
  railMode: KnowledgeGraphRailMode;
}): KnowledgeGraphWorkspaceState {
  const focusClusterId = input.activeClusterId ?? input.selectedNodeId ?? null;

  return {
    showOverviewGraph: true,
    showFocusInset: focusClusterId !== null,
    focusClusterId,
    railMode: input.railMode,
  };
}

export function resolveRailModeAfterAction(
  action: KnowledgeGraphRailAction,
  currentMode: KnowledgeGraphRailMode,
): KnowledgeGraphRailMode {
  if (action === "chat") return "chat";
  if (action === "quiz") return "quiz";
  if (action === "close-action") return "summary";
  return currentMode;
}
