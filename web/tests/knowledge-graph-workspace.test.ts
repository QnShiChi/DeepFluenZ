import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildWorkspaceState,
  resolveRailModeAfterAction,
} from "../lib/knowledge-graph-workspace.ts";

test("buildWorkspaceState keeps overview visible while opening a focused cluster", () => {
  const state = buildWorkspaceState({
    activeClusterId: "lesson-4",
    selectedNodeId: "lesson-4",
    railMode: "summary",
  });

  assert.equal(state.showOverviewGraph, true);
  assert.equal(state.showFocusInset, true);
  assert.equal(state.focusClusterId, "lesson-4");
  assert.equal(state.railMode, "summary");
});

test("resolveRailModeAfterAction widens the rail only for action-heavy flows", () => {
  assert.equal(resolveRailModeAfterAction("idle", "summary"), "summary");
  assert.equal(resolveRailModeAfterAction("chat", "summary"), "chat");
  assert.equal(resolveRailModeAfterAction("quiz", "summary"), "quiz");
  assert.equal(resolveRailModeAfterAction("close-action", "quiz"), "summary");
});

const source = readFileSync(
  new URL("../components/graph/KnowledgeGraphWorkspaceShell.tsx", import.meta.url),
  "utf8",
);

test("KnowledgeGraphWorkspaceShell renders graph-first layout zones", () => {
  assert.match(source, /grid-cols-\[minmax\(0,1\.85fr\)_minmax\(320px,1fr\)\]/);
  assert.match(source, /overviewSlot/);
  assert.match(source, /focusInsetSlot/);
  assert.match(source, /railSlot/);
});
