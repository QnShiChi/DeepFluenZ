import test from "node:test";
import assert from "node:assert/strict";

import { mapCourseKnowledgeGraphToFlow } from "../lib/course-knowledge-graph.ts";

test("mapCourseKnowledgeGraphToFlow preserves child hierarchy metadata", () => {
  const flow = mapCourseKnowledgeGraphToFlow({
    course_id: "oop-java",
    title: "OOP Java",
    source_type: "syllabus_text",
    nodes: [
      {
        node_id: "lesson-3",
        title: "Bai 3: Gioi thieu ve Java",
        description: "",
        node_type: "lesson",
        hierarchy_level: 0,
        source_label: "Bai 3",
        source_path: ["Bai 3"],
      },
      {
        node_id: "subtopic-3-2",
        title: "3.2 Cau truc chuong trinh Java",
        description: "",
        node_type: "subtopic",
        hierarchy_level: 1,
        parent_node_id: "lesson-3",
        source_label: "3.2",
        source_path: ["Bai 3", "3.2"],
      },
    ],
    edges: [
      {
        edge_id: "contains-3-2",
        source: "lesson-3",
        target: "subtopic-3-2",
        relation_type: "contains",
      },
    ],
    audit: {
      backbone_node_ids: ["lesson-3"],
      enriched_node_ids: ["subtopic-3-2"],
      backbone_edge_ids: [],
      enriched_edge_ids: ["contains-3-2"],
      warnings: [],
    },
  } as any);

  const child = flow.nodes.find((node) => node.id === "subtopic-3-2");
  assert.equal(child?.data.parentNodeId, "lesson-3");
  assert.equal(child?.data.hierarchyLevel, 1);
});
