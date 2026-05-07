import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createCytoscapeInteractionOptions,
  createCytoscapeStylesheet,
} from "../lib/cytoscape-graph-styles.ts";

const source = readFileSync(
  new URL("../components/graph/CytoscapeGraphCanvas.tsx", import.meta.url),
  "utf8",
);

test("createCytoscapeStylesheet differentiates prerequisite and contains edges", () => {
  const stylesheet = createCytoscapeStylesheet();
  const containsRule = stylesheet.find((rule) => rule.selector === "edge.relation-contains");
  const prerequisiteRule = stylesheet.find((rule) => rule.selector === "edge.relation-prerequisite");
  const backbonePathRule = stylesheet.find((rule) => rule.selector === "edge.relation-backbone_path");

  assert.ok(containsRule);
  assert.ok(prerequisiteRule);
  assert.ok(backbonePathRule);
  assert.notDeepEqual(containsRule?.style, prerequisiteRule?.style);
  assert.ok(Number(backbonePathRule?.style.opacity) >= 0.8);
});

test("createCytoscapeStylesheet defines focus-surface edge emphasis", () => {
  const stylesheet = createCytoscapeStylesheet("focus");
  const focusContainsRule = stylesheet.find((rule) => rule.selector === "edge.relation-contains");
  const focusPrereqRule = stylesheet.find((rule) => rule.selector === "edge.relation-prerequisite");
  const focusHiddenLabelRule = stylesheet.find((rule) => rule.selector === "node.label-density-hidden");
  const focusCompactLabelRule = stylesheet.find((rule) => rule.selector === "node.label-density-compact");

  assert.equal(focusContainsRule?.style.opacity, 0.42);
  assert.equal(focusPrereqRule?.style.width, 3.2);
  assert.equal(focusHiddenLabelRule?.style.label, "data(label)");
  assert.equal(focusCompactLabelRule?.style.label, "data(label)");
});

test("createCytoscapeStylesheet defines hierarchy, dimming, and label-density rules", () => {
  const stylesheet = createCytoscapeStylesheet();

  const lessonRule = stylesheet.find((rule) => rule.selector === "node.kind-lesson");
  const childRule = stylesheet.find((rule) => rule.selector === "node.kind-subtopic");
  const dimRule = stylesheet.find((rule) => rule.selector === "node.is-dimmed");
  const hiddenLabelRule = stylesheet.find((rule) => rule.selector === "node.label-density-hidden");
  const masteredRule = stylesheet.find((rule) => rule.selector === "node.state-mastered");
  const exploredRule = stylesheet.find((rule) => rule.selector === "node.state-explored");
  const defaultEdgeRule = stylesheet.find((rule) => rule.selector === "edge");
  const containsEdgeRule = stylesheet.find((rule) => rule.selector === "edge.relation-contains");

  assert.ok(lessonRule);
  assert.ok(childRule);
  assert.ok(dimRule);
  assert.ok(hiddenLabelRule);
  assert.ok(masteredRule);
  assert.ok(exploredRule);
  assert.ok(Number(lessonRule?.style.width) > Number(childRule?.style.width));
  assert.ok(Number(lessonRule?.style["font-size"]) >= 20);
  assert.ok(Number(childRule?.style["font-size"]) >= 15);
  assert.equal(dimRule?.style.opacity, 0.28);
  assert.equal(hiddenLabelRule?.style.label, "");
  assert.ok(Number(masteredRule?.style["border-width"]) >= 4);
  assert.ok(Number(exploredRule?.style["border-width"]) >= 3);
  assert.ok(Number(defaultEdgeRule?.style.opacity) >= 0.55);
  assert.ok(Number(containsEdgeRule?.style.opacity) >= 0.38);
});

test("createCytoscapeInteractionOptions explicitly enables zoom and useful viewport bounds", () => {
  const options = createCytoscapeInteractionOptions();

  assert.equal(options.zoomingEnabled, true);
  assert.equal(options.userZoomingEnabled, true);
  assert.equal(options.userPanningEnabled, true);
  assert.ok((options.maxZoom ?? 0) >= 2);
  assert.ok((options.minZoom ?? 1) <= 0.4);
});

test("CytoscapeGraphCanvas tracks zoom tiers and uses animated focus fitting", () => {
  assert.match(source, /cy\.on\("zoom"/);
  assert.match(source, /resolveZoomTier/);
  assert.match(source, /cy\.animate\(\{/);
  assert.match(source, /focusNodeId/);
});

test("CytoscapeGraphCanvas accepts a surface variant prop", () => {
  assert.match(source, /surfaceVariant\?: "overview" \| "focus"/);
  assert.match(source, /createCytoscapeStylesheet\(surfaceVariant\)/);
});

test("CytoscapeGraphCanvas suppresses synthetic taps immediately after node drags", () => {
  assert.match(source, /shouldHandleNodeTap/);
  assert.match(source, /const lastDragStopRef = useRef/);
  assert.match(source, /cy\.on\("dragfree", "node"/);
  assert.match(source, /lastDragStopRef\.current = \{/);
  assert.match(source, /if \(!shouldHandleNodeTap\(lastDragStopRef\.current, nodeId, Date\.now\(\)\)\) return;/);
});

test("CytoscapeGraphCanvas does not recreate the Cytoscape instance on element updates", () => {
  assert.doesNotMatch(source, /\}, \[elements, surfaceVariant\]\);/);
});
