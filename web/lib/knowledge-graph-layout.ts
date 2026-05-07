export interface GraphPoint {
  x: number;
  y: number;
}

export function buildClusterLayout(input: {
  parentId: string;
  parentPosition: GraphPoint;
  childIds: string[];
  radius: number;
}): Record<string, GraphPoint> {
  const positions: Record<string, GraphPoint> = {};
  const { childIds, parentPosition, radius } = input;

  childIds.forEach((childId, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(childIds.length, 1);
    positions[childId] = {
      x: parentPosition.x + Math.round(Math.cos(angle) * radius),
      y: parentPosition.y + Math.round(Math.sin(angle) * radius),
    };
  });

  return positions;
}

export function applyLayoutOverrides(
  base: Record<string, GraphPoint>,
  overrides: Record<string, GraphPoint>,
): Record<string, GraphPoint> {
  return { ...base, ...overrides };
}
