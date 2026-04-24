import test from "node:test";
import assert from "node:assert/strict";

import { resolveKnowledgeGraphCourseId } from "../lib/knowledge-graph-course.ts";

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
