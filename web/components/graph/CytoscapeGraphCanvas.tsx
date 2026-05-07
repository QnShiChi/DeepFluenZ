"use client";

import React, { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";

import type {
  CytoscapeEdgeElement,
  CytoscapeNodeElement,
} from "../../lib/cytoscape-knowledge-graph.ts";
import type { CytoscapeGraphPoint } from "../../lib/cytoscape-knowledge-graph-layout.ts";
import { createCytoscapeStylesheet } from "../../lib/cytoscape-graph-styles.ts";

export interface CytoscapeGraphCanvasProps {
  nodes: CytoscapeNodeElement[];
  edges: CytoscapeEdgeElement[];
  positions?: Record<string, CytoscapeGraphPoint>;
  className?: string;
  onNodeClick?: (nodeId: string) => void;
  onNodeDragStop?: (nodeId: string, position: CytoscapeGraphPoint) => void;
}

function toElementDefinitions(
  nodes: CytoscapeNodeElement[],
  edges: CytoscapeEdgeElement[],
  positions: Record<string, CytoscapeGraphPoint>,
): ElementDefinition[] {
  const nodeElements = nodes.map((node) => ({
    group: "nodes" as const,
    data: node.data,
    classes: node.classes,
    position: positions[node.data.id] ?? { x: 0, y: 0 },
  }));
  const edgeElements = edges.map((edge) => ({
    group: "edges" as const,
    data: {
      id: edge.data.id,
      source: edge.data.source,
      target: edge.data.target,
      relationType: edge.data.relationType,
    },
    classes: edge.classes,
  }));

  return [...nodeElements, ...edgeElements];
}

export default function CytoscapeGraphCanvas({
  nodes,
  edges,
  positions = {},
  className,
  onNodeClick,
  onNodeDragStop,
}: CytoscapeGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const clickHandlerRef = useRef(onNodeClick);
  const dragHandlerRef = useRef(onNodeDragStop);
  const elements = useMemo(
    () => toElementDefinitions(nodes, edges, positions),
    [nodes, edges, positions],
  );

  clickHandlerRef.current = onNodeClick;
  dragHandlerRef.current = onNodeDragStop;

  useEffect(() => {
    if (!containerRef.current || cyRef.current) {
      return;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: createCytoscapeStylesheet(),
      layout: { name: "preset" },
      wheelSensitivity: 0.18,
    });

    cy.on("tap", "node", (event) => {
      const nodeId = String(event.target.id());
      clickHandlerRef.current?.(nodeId);
    });

    cy.on("dragfree", "node", (event) => {
      const nodeId = String(event.target.id());
      const position = event.target.position();
      dragHandlerRef.current?.(nodeId, {
        x: Math.round(position.x),
        y: Math.round(position.y),
      });
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.json({ elements });
    cy.style(createCytoscapeStylesheet());
    cy.nodes().forEach((node) => {
      const position = positions[node.id()];
      if (position) {
        node.position(position);
      }
    });
    cy.fit(cy.elements(), 48);
  }, [elements, positions]);

  return React.createElement("div", {
    ref: containerRef,
    className,
    style: {
      width: "100%",
      minHeight: "720px",
      height: "100%",
    },
  });
}
