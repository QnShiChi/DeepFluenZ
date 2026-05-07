"use client";

import React, { useEffect, useMemo, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";

import type {
  CytoscapeEdgeElement,
  CytoscapeNodeElement,
} from "../../lib/cytoscape-knowledge-graph.ts";
import type { CytoscapeGraphPoint } from "../../lib/cytoscape-knowledge-graph-layout.ts";
import {
  createCytoscapeInteractionOptions,
  createCytoscapeStylesheet,
} from "../../lib/cytoscape-graph-styles.ts";
import { shouldHandleNodeTap } from "../../lib/cytoscape-graph-interactions.ts";

export interface CytoscapeGraphCanvasProps {
  nodes: CytoscapeNodeElement[];
  edges: CytoscapeEdgeElement[];
  positions?: Record<string, CytoscapeGraphPoint>;
  surfaceVariant?: "overview" | "focus";
  fitPadding?: number;
  className?: string;
  onNodeClick?: (nodeId: string) => void;
  onNodeDragStop?: (nodeId: string, position: CytoscapeGraphPoint) => void;
  onZoomTierChange?: (tier: "far" | "mid" | "near") => void;
  focusNodeId?: string | null;
  fitViewportVersion?: number;
}

function resolveZoomTier(zoom: number): "far" | "mid" | "near" {
  if (zoom < 0.58) return "far";
  if (zoom < 1.05) return "mid";
  return "near";
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
  surfaceVariant = "overview",
  fitPadding = 132,
  className,
  onNodeClick,
  onNodeDragStop,
  onZoomTierChange,
  focusNodeId,
  fitViewportVersion = 0,
}: CytoscapeGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const clickHandlerRef = useRef(onNodeClick);
  const dragHandlerRef = useRef(onNodeDragStop);
  const zoomTierHandlerRef = useRef(onZoomTierChange);
  const lastDragStopRef = useRef<{ nodeId: string; timestampMs: number } | null>(null);
  const hasAutoFitRef = useRef(false);
  const lastFitViewportVersionRef = useRef<number | null>(null);
  const elements = useMemo(
    () => toElementDefinitions(nodes, edges, positions),
    [nodes, edges, positions],
  );

  clickHandlerRef.current = onNodeClick;
  dragHandlerRef.current = onNodeDragStop;
  zoomTierHandlerRef.current = onZoomTierChange;

  useEffect(() => {
    if (!containerRef.current || cyRef.current) {
      return;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: createCytoscapeStylesheet(surfaceVariant),
      layout: { name: "preset" },
      ...createCytoscapeInteractionOptions(),
    });

    cy.on("tap", "node", (event) => {
      const nodeId = String(event.target.id());
      if (!shouldHandleNodeTap(lastDragStopRef.current, nodeId, Date.now())) return;
      clickHandlerRef.current?.(nodeId);
    });

    cy.on("dragfree", "node", (event) => {
      const nodeId = String(event.target.id());
      const position = event.target.position();
      lastDragStopRef.current = {
        nodeId,
        timestampMs: Date.now(),
      };
      dragHandlerRef.current?.(nodeId, {
        x: Math.round(position.x),
        y: Math.round(position.y),
      });
    });

    cy.on("zoom", () => {
      zoomTierHandlerRef.current?.(resolveZoomTier(cy.zoom()));
    });

    cyRef.current = cy;

    return () => {
      hasAutoFitRef.current = false;
      lastFitViewportVersionRef.current = null;
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }

    cy.json({ elements });
    cy.style(createCytoscapeStylesheet(surfaceVariant));
    cy.nodes().forEach((node) => {
      const position = positions[node.id()];
      if (position) {
        node.position(position);
      }
    });
  }, [elements, positions, surfaceVariant]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !elements.length) {
      return;
    }

    if (!hasAutoFitRef.current) {
      cy.fit(cy.elements(), fitPadding);
      hasAutoFitRef.current = true;
      lastFitViewportVersionRef.current = fitViewportVersion;
      zoomTierHandlerRef.current?.(resolveZoomTier(cy.zoom()));
      return;
    }

    if (lastFitViewportVersionRef.current !== fitViewportVersion) {
      cy.fit(cy.elements(), fitPadding);
      lastFitViewportVersionRef.current = fitViewportVersion;
      zoomTierHandlerRef.current?.(resolveZoomTier(cy.zoom()));
    }
  }, [elements.length, fitPadding, fitViewportVersion]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focusNodeId) {
      return;
    }

    const focusNode = cy.getElementById(focusNodeId);
    if (!focusNode.length) {
      return;
    }

    cy.animate({
      center: { eles: focusNode },
      zoom: Math.max(cy.zoom(), 0.82),
    }, {
      duration: 220,
    });
  }, [focusNodeId]);

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
