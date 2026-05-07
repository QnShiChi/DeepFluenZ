export interface CytoscapeGraphPoint {
  x: number;
  y: number;
}

export function buildBackboneRadialLayout(
  nodeIds: string[],
  options: { centerX: number; centerY: number; radius: number },
): Record<string, CytoscapeGraphPoint> {
  const result: Record<string, CytoscapeGraphPoint> = {};
  const firstRingCapacity = 6;
  const ringSpacing = 168;

  nodeIds.forEach((id, index) => {
    const ringIndex = Math.floor(index / firstRingCapacity);
    const indexWithinRing = index % firstRingCapacity;
    const ringCount = Math.min(firstRingCapacity, nodeIds.length - ringIndex * firstRingCapacity);
    const angle = -Math.PI / 2 + (Math.PI * 2 * indexWithinRing) / Math.max(ringCount, 1);
    const radius = options.radius + ringIndex * ringSpacing + indexWithinRing * 8;
    result[id] = {
      x: Math.round(options.centerX + Math.cos(angle) * radius),
      y: Math.round(options.centerY + Math.sin(angle) * radius),
    };
  });

  return result;
}

export function buildExpandedClusterLayout(
  _parentId: string,
  childIds: string[],
  options: { parent: CytoscapeGraphPoint; radius: number },
): Record<string, CytoscapeGraphPoint> {
  const result: Record<string, CytoscapeGraphPoint> = {};
  const total = Math.max(childIds.length, 1);
  const densityBonus = Math.max(0, total - 4) * 18;
  const effectiveRadius = options.radius + densityBonus;

  childIds.forEach((id, index) => {
    const angle = (Math.PI * 2 * index) / total;
    result[id] = {
      x: Math.round(options.parent.x + Math.cos(angle) * effectiveRadius),
      y: Math.round(options.parent.y + Math.sin(angle) * effectiveRadius),
    };
  });

  return result;
}

export function buildFocusInsetLayout(
  clusterId: string,
  childIds: string[],
): Record<string, CytoscapeGraphPoint> {
  const center = { x: 280, y: 220 };
  const radius = Math.max(156, 132 + childIds.length * 18);
  const result: Record<string, CytoscapeGraphPoint> = {
    [clusterId]: center,
  };

  childIds.forEach((childId, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(childIds.length, 1);
    result[childId] = {
      x: Math.round(center.x + Math.cos(angle) * radius),
      y: Math.round(center.y + Math.sin(angle) * radius),
    };
  });

  return result;
}

export function applyCytoscapeLayoutOverrides(
  base: Record<string, CytoscapeGraphPoint>,
  overrides: Record<string, CytoscapeGraphPoint>,
): Record<string, CytoscapeGraphPoint> {
  return { ...base, ...overrides };
}

export function filterVisibleCytoscapeNodeIds(
  nodes: Array<{ id: string; parentId: string; hierarchyLevel: number }>,
  expandedLessonIds: string[],
): string[] {
  const expanded = new Set(expandedLessonIds);

  return nodes
    .filter((node) => node.hierarchyLevel === 0 || expanded.has(node.parentId))
    .map((node) => node.id);
}
