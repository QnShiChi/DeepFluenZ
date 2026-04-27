import test from "node:test";
import assert from "node:assert/strict";

import { mergeKnowledgeGraphProgress } from "../lib/knowledge-graph-progress.ts";

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
