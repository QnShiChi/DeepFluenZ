import test from "node:test";
import assert from "node:assert/strict";

import {
  getTimelineCategoryLabel,
  getTimelineReasonTagLabel,
  groupTimelineEventsByDay,
} from "../lib/graph-timeline-ui.ts";

test("groupTimelineEventsByDay groups events under the same YYYY-MM-DD bucket", () => {
  const groups = groupTimelineEventsByDay([
    {
      event_id: "evt_2",
      created_at: "2026-04-29T09:05:00Z",
      summary: "B",
    },
    {
      event_id: "evt_1",
      created_at: "2026-04-29T09:00:00Z",
      summary: "A",
    },
  ] as never[]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.dayKey, "2026-04-29");
  assert.equal(groups[0]?.events.length, 2);
});

test("timeline labels map categories and reason tags to user-facing copy", () => {
  assert.equal(getTimelineCategoryLabel("quiz"), "Quiz");
  assert.equal(getTimelineReasonTagLabel("recent_weakness"), "Còn yếu gần đây");
});
