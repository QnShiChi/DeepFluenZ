export interface RecentNodeDragStop {
  nodeId: string;
  timestampMs: number;
}

const DEFAULT_DRAG_TAP_SUPPRESSION_MS = 240;

export function shouldHandleNodeTap(
  lastDragStop: RecentNodeDragStop | null,
  nodeId: string,
  timestampMs: number,
  suppressionWindowMs = DEFAULT_DRAG_TAP_SUPPRESSION_MS,
): boolean {
  if (!lastDragStop) return true;
  if (lastDragStop.nodeId !== nodeId) return true;
  return timestampMs - lastDragStop.timestampMs > suppressionWindowMs;
}
