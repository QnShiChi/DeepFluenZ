export type CytoscapeStylesheetRule = {
  selector: string;
  style: Record<string, string | number>;
};

export function createCytoscapeStylesheet(): CytoscapeStylesheetRule[] {
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "background-color": "#ffffff",
        "border-color": "#94a3b8",
        "border-width": 1.5,
        color: "#0f172a",
        "font-size": 12,
        "text-wrap": "wrap",
        "text-max-width": 104,
        "text-valign": "center",
        "text-halign": "center",
        width: 92,
        height: 92,
      },
    },
    {
      selector: "node.kind-lesson",
      style: {
        "background-color": "#dcfce7",
        "border-color": "#16a34a",
        "border-width": 3,
        width: 124,
        height: 124,
        "font-size": 15,
        "text-max-width": 100,
      },
    },
    {
      selector: "node.kind-subtopic",
      style: {
        "background-color": "#eff6ff",
        "border-color": "#2563eb",
        "border-width": 2,
        width: 86,
        height: 86,
        "font-size": 12,
        "text-max-width": 72,
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
        width: 2,
        "line-color": "#cbd5e1",
        "curve-style": "bezier",
      },
    },
    {
      selector: "edge.relation-prerequisite",
      style: {
        width: 3,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    {
      selector: "edge.relation-contains",
      style: {
        width: 1.5,
        "line-color": "#cbd5e1",
        "target-arrow-shape": "none",
        "curve-style": "haystack",
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
