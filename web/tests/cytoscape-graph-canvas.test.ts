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

  assert.ok(containsRule);
  assert.ok(prerequisiteRule);
  assert.notDeepEqual(containsRule?.style, prerequisiteRule?.style);
});

test("createCytoscapeStylesheet defines hierarchy, dimming, and label-density rules", () => {
  const stylesheet = createCytoscapeStylesheet();

  const lessonRule = stylesheet.find((rule) => rule.selector === "node.kind-lesson");
  const childRule = stylesheet.find((rule) => rule.selector === "node.kind-subtopic");
  const dimRule = stylesheet.find((rule) => rule.selector === "node.is-dimmed");
  const hiddenLabelRule = stylesheet.find((rule) => rule.selector === "node.label-density-hidden");

  assert.ok(lessonRule);
  assert.ok(childRule);
  assert.ok(dimRule);
  assert.ok(hiddenLabelRule);
  assert.ok(Number(lessonRule?.style.width) > Number(childRule?.style.width));
  assert.equal(dimRule?.style.opacity, 0.28);
  assert.equal(hiddenLabelRule?.style.label, "");
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
