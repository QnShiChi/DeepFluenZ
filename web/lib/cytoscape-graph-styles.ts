export type CytoscapeStylesheetRule = {
  selector: string;
  style: Record<string, string | number>;
};

export interface CytoscapeInteractionOptions {
  wheelSensitivity: number;
  zoomingEnabled: boolean;
  userZoomingEnabled: boolean;
  userPanningEnabled: boolean;
  minZoom: number;
  maxZoom: number;
}

export function createCytoscapeInteractionOptions(): CytoscapeInteractionOptions {
  return {
    wheelSensitivity: 0.24,
    zoomingEnabled: true,
    userZoomingEnabled: true,
    userPanningEnabled: true,
    minZoom: 0.3,
    maxZoom: 3,
  };
}

export function createCytoscapeStylesheet(
  surfaceVariant: "overview" | "focus" = "overview",
): CytoscapeStylesheetRule[] {
  const isFocusSurface = surfaceVariant === "focus";

  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        shape: "round-rectangle",
        "background-color": "#f8fafc",
        "border-color": "#94a3b8",
        "border-width": 1.5,
        color: "#0f172a",
        "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
        "font-size": 15,
        "font-weight": 600,
        "text-wrap": "wrap",
        "text-max-width": 156,
        "text-valign": "center",
        "text-halign": "center",
        "text-margin-y": 0,
        width: 144,
        height: 144,
      },
    },
    {
      selector: "node.kind-lesson",
      style: {
        "background-fill": "linear-gradient",
        "background-gradient-stop-colors": "#ecfdf5 #dcfce7",
        "background-gradient-direction": "to-bottom",
        "border-color": "#22c55e",
        "border-width": 3,
        width: 212,
        height: 212,
        "font-size": 21,
        "font-weight": 700,
        "text-max-width": 182,
      },
    },
    {
      selector: "node.kind-subtopic",
      style: {
        "background-fill": "linear-gradient",
        "background-gradient-stop-colors": "#f8fbff #eff6ff",
        "background-gradient-direction": "to-bottom",
        "border-color": "#3b82f6",
        "border-width": 2,
        width: 152,
        height: 152,
        "font-size": 15,
        "text-max-width": 126,
      },
    },
    {
      selector: "node.is-dimmed",
      style: {
        opacity: 0.28,
      },
    },
    {
      selector: "node.is-contextual",
      style: {
        opacity: 0.96,
      },
    },
    {
      selector: "node.is-active-cluster",
      style: {
        "border-width": 4,
        "underlay-color": "#86efac",
        "underlay-opacity": 0.16,
        "underlay-padding": 10,
      },
    },
    {
      selector: "node.label-density-hidden",
      style: {
        label: isFocusSurface ? "data(label)" : "",
        "font-size": isFocusSurface ? 12 : 15,
        "text-max-width": isFocusSurface ? 88 : 146,
      },
    },
    {
      selector: "node.label-density-compact",
      style: {
        label: isFocusSurface ? "data(label)" : "data(label)",
        "font-size": isFocusSurface ? 12 : 13,
        "text-max-width": isFocusSurface ? 88 : 118,
      },
    },
    {
      selector: "node.is-recommended",
      style: {
        "border-color": "#3b82f6",
        "border-width": 4,
        "overlay-color": "#3b82f6",
        "overlay-opacity": 0.08,
      },
    },
    {
      selector: "node.is-current",
      style: {
        "border-color": "#0ea5e9",
        "border-width": 4,
        "overlay-color": "#38bdf8",
        "overlay-opacity": 0.1,
      },
    },
    {
      selector: "node.state-mastered",
      style: {
        "border-color": "#16a34a",
        "border-width": 4,
        "background-gradient-stop-colors": "#dcfce7 #bbf7d0",
        "overlay-color": "#22c55e",
        "overlay-opacity": 0.08,
      },
    },
    {
      selector: "node.state-explored",
      style: {
        "border-color": "#f59e0b",
        "border-width": 3.5,
        "background-gradient-stop-colors": "#fef3c7 #fde68a",
        "overlay-color": "#f59e0b",
        "overlay-opacity": 0.08,
      },
    },
    {
      selector: "node.state-needs_remediation",
      style: {
        "border-color": "#ef4444",
        "border-width": 4,
        "overlay-color": "#ef4444",
        "overlay-opacity": 0.08,
      },
    },
    {
      selector: "node.state-locked",
      style: {
        opacity: 0.55,
        color: "#64748b",
        "background-color": "#e5e7eb",
      },
    },
    {
      selector: "edge",
      style: {
        width: 2.2,
        opacity: 0.58,
        "line-color": "#b7c5d8",
        "curve-style": "unbundled-bezier",
      },
    },
    {
      selector: "edge.relation-prerequisite",
      style: {
        width: isFocusSurface ? 3.2 : 2.4,
        opacity: isFocusSurface ? 0.82 : 0.7,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        "target-arrow-shape": "triangle",
      },
    },
    {
      selector: "edge.relation-backbone_path",
      style: {
        width: isFocusSurface ? 3.6 : 3.2,
        opacity: isFocusSurface ? 0.92 : 0.84,
        "line-color": "#7dd3fc",
        "target-arrow-color": "#7dd3fc",
        "target-arrow-shape": "triangle",
      },
    },
    {
      selector: "edge.relation-contains",
      style: {
        width: isFocusSurface ? 1.8 : 1.2,
        opacity: isFocusSurface ? 0.42 : 0.4,
        "line-color": isFocusSurface ? "#94a3b8" : "#b8c4d6",
        "target-arrow-shape": "none",
      },
    },
    {
      selector: "edge.relation-related_to",
      style: {
        width: 2,
        "line-style": "dashed",
        "line-color": "#f59e0b",
        "target-arrow-shape": "none",
      },
    },
  ];
}
