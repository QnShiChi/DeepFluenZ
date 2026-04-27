import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveKnowledgeGraphCourseId,
  resolveKnowledgeGraphLoadState,
} from "../lib/knowledge-graph-course.ts";

test("resolveKnowledgeGraphCourseId prefers the session-bound course id", () => {
  assert.equal(
    resolveKnowledgeGraphCourseId({ course_id: "session-course" }, "stored-course"),
    "session-course",
  );
});

test("resolveKnowledgeGraphCourseId falls back to stored course id when session has none", () => {
  assert.equal(resolveKnowledgeGraphCourseId({}, "stored-course"), "stored-course");
  assert.equal(resolveKnowledgeGraphCourseId(undefined, "stored-course"), "stored-course");
});

test("resolveKnowledgeGraphCourseId returns null when no course id exists", () => {
  assert.equal(resolveKnowledgeGraphCourseId({}, null), null);
});

test("resolveKnowledgeGraphLoadState loads template without a session id", () => {
  assert.deepEqual(resolveKnowledgeGraphLoadState("stored-course", undefined), {
    shouldLoadTemplate: true,
    shouldLoadProgress: false,
  });
});

test("resolveKnowledgeGraphLoadState loads template and progress when both ids exist", () => {
  assert.deepEqual(resolveKnowledgeGraphLoadState("stored-course", "session-1"), {
    shouldLoadTemplate: true,
    shouldLoadProgress: true,
  });
});

test("resolveKnowledgeGraphLoadState skips all loading when course id is missing", () => {
  assert.deepEqual(resolveKnowledgeGraphLoadState(null, "session-1"), {
    shouldLoadTemplate: false,
    shouldLoadProgress: false,
  });
});
