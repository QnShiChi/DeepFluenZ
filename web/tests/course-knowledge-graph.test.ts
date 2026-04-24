import test from "node:test";
import assert from "node:assert/strict";

import { mapCourseKnowledgeGraphToFlow } from "../lib/course-knowledge-graph.ts";

test("mapCourseKnowledgeGraphToFlow preserves relation labels and node styling hints", () => {
  const flow = mapCourseKnowledgeGraphToFlow({
    course_id: "intro-ai",
    title: "Intro to AI",
    source_type: "manual_json",
    nodes: [
      {
        node_id: "topic_intro",
        title: "Introduction to AI",
        node_type: "topic",
        description: "Overview",
        difficulty: "easy",
        learning_outcomes: [],
        examples: [],
        related_questions: [],
        resources: [],
        source_refs: [],
      },
      {
        node_id: "concept_search",
        title: "Search Space",
        node_type: "concept",
        description: "State-space view",
        difficulty: "medium",
        learning_outcomes: [],
        examples: [],
        related_questions: [],
        resources: [],
        source_refs: [],
      },
    ],
    edges: [
      {
        edge_id: "edge_1",
        source: "topic_intro",
        target: "concept_search",
        relation_type: "part_of",
        confidence: 1,
        rationale: "Appears in week outline",
        source_refs: [],
      },
    ],
    audit: {
      backbone_node_ids: ["topic_intro"],
      enriched_node_ids: ["concept_search"],
      backbone_edge_ids: ["edge_1"],
      enriched_edge_ids: [],
      warnings: [],
    },
  });

  assert.equal(flow.nodes[0].data.label, "Introduction to AI");
  assert.equal(flow.edges[0].label, "part_of");
});
