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

test("mapCourseKnowledgeGraphToFlow generates unique ids for duplicate edges", () => {
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
        edge_id: "edge_dup",
        source: "topic_intro",
        target: "concept_search",
        relation_type: "part_of",
        confidence: 1,
        rationale: "Appears in week outline",
        source_refs: [],
      },
      {
        edge_id: "edge_dup",
        source: "topic_intro",
        target: "concept_search",
        relation_type: "related_to",
        confidence: 0.8,
        rationale: "Cross link",
        source_refs: [],
      },
    ],
    audit: {
      backbone_node_ids: ["topic_intro"],
      enriched_node_ids: ["concept_search"],
      backbone_edge_ids: ["edge_dup"],
      enriched_edge_ids: ["edge_dup"],
      warnings: [],
    },
  });

  assert.equal(flow.edges.length, 2);
  assert.notEqual(flow.edges[0].id, flow.edges[1].id);
});

test("mapCourseKnowledgeGraphToFlow falls back when node and edge ids are missing", () => {
  const flow = mapCourseKnowledgeGraphToFlow({
    course_id: "intro-ai",
    title: "Intro to AI",
    source_type: "manual_json",
    nodes: [
      {
        node_id: undefined,
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
        node_id: "",
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
        edge_id: undefined,
        source: "node-0",
        target: "node-1",
        relation_type: "part_of",
        confidence: 1,
        rationale: "Appears in week outline",
        source_refs: [],
      },
      {
        edge_id: "",
        source: "node-0",
        target: "node-1",
        relation_type: "related_to",
        confidence: 0.8,
        rationale: "Cross link",
        source_refs: [],
      },
    ],
    audit: {
      backbone_node_ids: [],
      enriched_node_ids: [],
      backbone_edge_ids: [],
      enriched_edge_ids: [],
      warnings: [],
    },
  } as any);

  assert.equal(flow.nodes[0].id, "node-0");
  assert.equal(flow.nodes[1].id, "node-1");
  assert.equal(flow.edges[0].id, "edge-0");
  assert.equal(flow.edges[1].id, "edge-1");
});

test("mapCourseKnowledgeGraphToFlow marks the recommended node with styling metadata", () => {
  const flow = mapCourseKnowledgeGraphToFlow(
    {
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
      ],
      edges: [],
      audit: {
        backbone_node_ids: ["topic_intro"],
        enriched_node_ids: [],
        backbone_edge_ids: [],
        enriched_edge_ids: [],
        warnings: [],
      },
    },
    { recommendedNodeId: "topic_intro" },
  );

  assert.equal(flow.nodes[0].data.isRecommended, true);
  assert.match(String(flow.nodes[0].style?.border), /3px/);
});
