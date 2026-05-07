import test from "node:test";
import assert from "node:assert/strict";

import { mapCourseKnowledgeGraphToCytoscape } from "../lib/cytoscape-knowledge-graph.ts";

test("mapCourseKnowledgeGraphToCytoscape emits semantic lesson and subtopic nodes", () => {
  const result = mapCourseKnowledgeGraphToCytoscape(
    {
      course_id: "oop-java",
      title: "OOP Java",
      source_type: "syllabus_pdf",
      nodes: [
        { node_id: "lesson-1", title: "Bai 1", node_type: "lesson", hierarchy_level: 0 },
        {
          node_id: "subtopic-1-1",
          title: "1.1",
          node_type: "subtopic",
          hierarchy_level: 1,
          parent_node_id: "lesson-1",
        },
      ],
      edges: [
        { edge_id: "contains-1-1", source: "lesson-1", target: "subtopic-1-1", relation_type: "contains" },
      ],
      audit: {
        backbone_node_ids: ["lesson-1"],
        enriched_node_ids: ["subtopic-1-1"],
        backbone_edge_ids: [],
        enriched_edge_ids: ["contains-1-1"],
        warnings: [],
      },
    },
    {
      expandedLessonIds: ["lesson-1"],
      currentNodeId: "lesson-1",
      recommendedNodeId: "subtopic-1-1",
      progressMap: { "lesson-1": "mastered" },
      issuesByNodeId: {},
      remediationState: null,
    },
  );

  const lesson = result.nodes.find((node) => node.data.id === "lesson-1");
  const subtopic = result.nodes.find((node) => node.data.id === "subtopic-1-1");
  const containsEdge = result.edges.find((edge) => edge.data.id === "contains-1-1");

  assert.equal(lesson?.classes.includes("kind-lesson"), true);
  assert.equal(subtopic?.classes.includes("is-recommended"), true);
  assert.equal(containsEdge?.classes.includes("relation-contains"), true);
});
