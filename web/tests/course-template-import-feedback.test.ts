import test from "node:test";
import assert from "node:assert/strict";

import { describeCourseTemplateImport } from "../lib/course-template-import-feedback.ts";

test("describeCourseTemplateImport returns degraded message for backbone-only imports", () => {
  const feedback = describeCourseTemplateImport({
    import_report: {
      status: "backbone_only",
      warning_count: 1,
    },
    warnings: ["Enrichment stage failed; saved backbone-only graph."],
  });

  assert.equal(feedback.variant, "warning");
  assert.match(feedback.message, /import một phần/i);
  assert.match(feedback.message, /backbone-only graph/i);
});

test("describeCourseTemplateImport returns success message for enriched imports", () => {
  const feedback = describeCourseTemplateImport({
    import_report: {
      status: "enriched",
      warning_count: 0,
    },
    warnings: [],
  });

  assert.equal(feedback.variant, "success");
  assert.match(feedback.message, /thành công/i);
  assert.doesNotMatch(feedback.message, /một phần/i);
});
