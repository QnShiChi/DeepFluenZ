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

export function createCytoscapeStylesheet(): CytoscapeStylesheetRule[] {
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
        "font-size": 14,
        "font-weight": 600,
        "text-wrap": "wrap",
        "text-max-width": 146,
        "text-valign": "center",
        "text-halign": "center",
        "text-margin-y": 0,
        width: 132,
        height: 132,
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
        width: 184,
        height: 184,
        "font-size": 18,
        "font-weight": 700,
        "text-max-width": 156,
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
        width: 136,
        height: 136,
        "font-size": 14,
        "text-max-width": 112,
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
        label: "",
      },
    },
    {
      selector: "node.label-density-compact",
      style: {
        label: "data(ordinal)",
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
        width: 1.5,
        opacity: 0.32,
        "line-color": "#94a3b8",
        "curve-style": "unbundled-bezier",
      },
    },
    {
      selector: "edge.relation-prerequisite",
      style: {
        width: 2.4,
        opacity: 0.56,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        "target-arrow-shape": "triangle",
      },
    },
    {
      selector: "edge.relation-contains",
      style: {
        width: 1.2,
        opacity: 0.22,
        "line-color": "#cbd5e1",
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
