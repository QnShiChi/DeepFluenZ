import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFocusedCytoscapeSubgraph,
  mapCourseKnowledgeGraphToCytoscape,
} from "../lib/cytoscape-knowledge-graph.ts";

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

test("mapCourseKnowledgeGraphToCytoscape marks active cluster, contextual children, and dimmed unrelated nodes", () => {
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
        { node_id: "lesson-2", title: "Bai 2", node_type: "lesson", hierarchy_level: 0 },
      ],
      edges: [
        { edge_id: "contains-1-1", source: "lesson-1", target: "subtopic-1-1", relation_type: "contains" },
      ],
      audit: {
        backbone_node_ids: ["lesson-1", "lesson-2"],
        enriched_node_ids: ["subtopic-1-1"],
        backbone_edge_ids: [],
        enriched_edge_ids: ["contains-1-1"],
        warnings: [],
      },
    },
    {
      expandedLessonIds: ["lesson-1"],
      activeClusterId: "lesson-1",
      zoomTier: "mid",
      currentNodeId: "lesson-1",
      recommendedNodeId: "subtopic-1-1",
      progressMap: {},
      issuesByNodeId: {},
      remediationState: null,
    } as any,
  );

  const lesson1 = result.nodes.find((node) => node.data.id === "lesson-1");
  const child = result.nodes.find((node) => node.data.id === "subtopic-1-1");
  const lesson2 = result.nodes.find((node) => node.data.id === "lesson-2");

  assert.equal(lesson1?.classes.includes("is-active-cluster"), true);
  assert.equal(child?.classes.includes("is-contextual"), true);
  assert.equal(lesson2?.classes.includes("is-dimmed"), true);
  assert.equal((child?.data as any).labelDensityMode, "full");
});

test("mapCourseKnowledgeGraphToCytoscape keeps unrelated nodes visible but dimmed during active-cluster focus", () => {
  const result = mapCourseKnowledgeGraphToCytoscape(
    {
      course_id: "oop-java",
      title: "OOP Java",
      source_type: "syllabus_pdf",
      nodes: [
        { node_id: "lesson-1", title: "Bai 1", node_type: "lesson", hierarchy_level: 0 },
        { node_id: "lesson-2", title: "Bai 2", node_type: "lesson", hierarchy_level: 0 },
      ],
      edges: [],
      audit: {
        backbone_node_ids: ["lesson-1", "lesson-2"],
        enriched_node_ids: [],
        backbone_edge_ids: [],
        enriched_edge_ids: [],
        warnings: [],
      },
    },
    {
      expandedLessonIds: ["lesson-1"],
      activeClusterId: "lesson-1",
      zoomTier: "mid",
    },
  );

  const unrelated = result.nodes.find((node) => node.data.id === "lesson-2");
  assert.equal(unrelated?.data.isVisibleInOverview, true);
  assert.equal(unrelated?.classes.includes("is-dimmed"), true);
});

test("mapCourseKnowledgeGraphToCytoscape hides non-contextual child labels at far zoom", () => {
  const result = mapCourseKnowledgeGraphToCytoscape(
    {
      course_id: "oop-java",
      title: "OOP Java",
      source_type: "syllabus_pdf",
      nodes: [
        { node_id: "lesson-1", title: "Bai 1", node_type: "lesson", hierarchy_level: 0, ordinal: "1" },
        {
          node_id: "subtopic-1-1",
          title: "1.1 Variables",
          node_type: "subtopic",
          hierarchy_level: 1,
          parent_node_id: "lesson-1",
          ordinal: "1.1",
        },
      ],
      edges: [],
      audit: {
        backbone_node_ids: ["lesson-1"],
        enriched_node_ids: ["subtopic-1-1"],
        backbone_edge_ids: [],
        enriched_edge_ids: [],
        warnings: [],
      },
    },
    {
      expandedLessonIds: ["lesson-1"],
      activeClusterId: null,
      zoomTier: "far",
    },
  );

  const child = result.nodes.find((node) => node.data.id === "subtopic-1-1");
  assert.equal(child?.data.labelDensityMode, "hidden");
  assert.equal(child?.classes.includes("label-density-hidden"), true);
});

test("buildFocusedCytoscapeSubgraph keeps the selected cluster and its local relations", () => {
  const focused = buildFocusedCytoscapeSubgraph(
    {
      nodes: [
        { data: { id: "lesson-2", parentId: "", hierarchyLevel: 0 } },
        { data: { id: "subtopic-2-1", parentId: "lesson-2", hierarchyLevel: 1 } },
        { data: { id: "lesson-3", parentId: "", hierarchyLevel: 0 } },
      ],
      edges: [
        {
          data: {
            id: "contains-2-1",
            source: "lesson-2",
            target: "subtopic-2-1",
            relationType: "contains",
          },
        },
      ],
    } as any,
    "lesson-2",
  );

  assert.deepEqual(focused.nodes.map((node) => node.data.id), ["lesson-2", "subtopic-2-1"]);
  assert.deepEqual(focused.edges.map((edge) => edge.data.id), ["contains-2-1"]);
});
