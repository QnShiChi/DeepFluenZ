import test from "node:test";
import assert from "node:assert/strict";

import { createCytoscapeStylesheet } from "../lib/cytoscape-graph-styles.ts";

test("createCytoscapeStylesheet differentiates prerequisite and contains edges", () => {
  const stylesheet = createCytoscapeStylesheet();
  const containsRule = stylesheet.find((rule) => rule.selector === "edge.relation-contains");
  const prerequisiteRule = stylesheet.find((rule) => rule.selector === "edge.relation-prerequisite");

  assert.ok(containsRule);
  assert.ok(prerequisiteRule);
  assert.notDeepEqual(containsRule?.style, prerequisiteRule?.style);
});
