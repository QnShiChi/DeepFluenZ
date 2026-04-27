import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeKnowledgeGraphProgress,
  reconcileKnowledgeGraphProgressAfterSync,
} from "../lib/knowledge-graph-progress.ts";

test("mergeKnowledgeGraphProgress keeps local mastered status when remote is weaker", () => {
  const merged = mergeKnowledgeGraphProgress(
    { topic_intro: "mastered", topic_search: "explored" },
    { topic_intro: "explored", topic_planning: "explored" },
  );

  assert.deepEqual(merged, {
    topic_intro: "mastered",
    topic_search: "explored",
    topic_planning: "explored",
  });
});

test("reconcileKnowledgeGraphProgressAfterSync keeps local progress when sync succeeds", () => {
  const reconciled = reconcileKnowledgeGraphProgressAfterSync(
    {
      topic_intro: "mastered",
      topic_search: "explored",
    },
    {},
  );

  assert.deepEqual(reconciled, {
    topic_intro: "mastered",
    topic_search: "explored",
  });
});

test("reconcileKnowledgeGraphProgressAfterSync preserves only failed entries when sync partially fails", () => {
  const reconciled = reconcileKnowledgeGraphProgressAfterSync(
    {
      topic_intro: "mastered",
      topic_search: "explored",
    },
    {
      topic_search: "explored",
    },
  );

  assert.deepEqual(reconciled, {
    topic_search: "explored",
  });
});
