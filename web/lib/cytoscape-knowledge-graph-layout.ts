export interface CytoscapeGraphPoint {
  x: number;
  y: number;
}

export function buildBackboneRadialLayout(
  nodeIds: string[],
  options: { centerX: number; centerY: number; radius: number },
): Record<string, CytoscapeGraphPoint> {
  const result: Record<string, CytoscapeGraphPoint> = {};
  const total = Math.max(nodeIds.length, 1);

  nodeIds.forEach((id, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
    const radius = options.radius + index * 6;
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

  childIds.forEach((id, index) => {
    const angle = (Math.PI * 2 * index) / total;
    result[id] = {
      x: Math.round(options.parent.x + Math.cos(angle) * options.radius),
      y: Math.round(options.parent.y + Math.sin(angle) * options.radius),
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
