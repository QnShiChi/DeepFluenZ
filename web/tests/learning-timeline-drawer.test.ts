import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../components/graph/LearningTimelineDrawer.tsx", import.meta.url),
  "utf8",
);

test("LearningTimelineDrawer source keeps drawer title and filter set", () => {
  assert.match(source, /Learning Timeline/);
  assert.match(source, /"node",\s*"quiz",\s*"remediation",\s*"recommendation"/);
});

test("LearningTimelineDrawer source keeps detail toggle copy", () => {
  assert.match(source, /Xem chi tiết/);
  assert.match(source, /Ẩn chi tiết/);
});

test("LearningTimelineDrawer source keeps review-aware helper copy", () => {
  assert.match(source, /đổi hướng đề xuất|doi huong de xuat/i);
  assert.match(source, /Learning Timeline/);
});
