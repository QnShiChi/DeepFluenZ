import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001";

test("applyGraphQaFix posts fix_id and returns the updated report", async () => {
  const { applyGraphQaFix } = await import("../lib/graph-qa-api.ts");
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        course_id: "intro-ai",
        health_summary: {
          score: 1,
          adaptive_ready: true,
          critical_count: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 0,
        },
        issues: [],
        suggested_fixes: [],
        gate_status: {
          status: "adaptive_ready",
          blocking_issue_ids: [],
          student_visible_message: "",
          instructor_message: "",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const report = await applyGraphQaFix("intro-ai", "fix_edge_intro_search");

    assert.equal(report.course_id, "intro-ai");
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/api\/v1\/graph\/qa\/fixes\/intro-ai\/apply$/);
    assert.equal(calls[0]?.init?.method, "POST");
    assert.deepEqual(calls[0]?.init?.headers, { "Content-Type": "application/json" });
    assert.equal(calls[0]?.init?.body, JSON.stringify({ fix_id: "fix_edge_intro_search" }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stageGraphQaFixes posts fix_ids and getGraphQaGate returns the report gate status", async () => {
  const { getGraphQaDraft, getGraphQaGate, stageGraphQaFixes } = await import("../lib/graph-qa-api.ts");
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    if (String(input).includes("/draft")) {
      return new Response(
        JSON.stringify({
          course_id: "intro-ai",
          changes: [
            {
              change_id: "change_fix_edge_intro_search",
              fix_id: "fix_edge_intro_search",
              change_type: "change_relation_type",
              preview: { edge_id: "edge_intro_search" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        course_id: "intro-ai",
        health_summary: {
          score: 0.6,
          adaptive_ready: false,
          critical_count: 0,
          high_count: 1,
          medium_count: 0,
          low_count: 0,
        },
        issues: [],
        suggested_fixes: [],
        gate_status: {
          status: "adaptive_limited",
          blocking_issue_ids: ["issue_1"],
          student_visible_message: "Student note",
          instructor_message: "Instructor note",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const draft = await stageGraphQaFixes("intro-ai", ["fix_edge_intro_search"]);
    const gate = await getGraphQaGate("intro-ai");
    const loadedDraft = await getGraphQaDraft("intro-ai");

    assert.equal(draft.changes.length, 1);
    assert.equal(gate?.status, "adaptive_limited");
    assert.equal(loadedDraft?.changes[0]?.fix_id, "fix_edge_intro_search");
    assert.match(calls[0]?.url ?? "", /\/api\/v1\/graph\/qa\/fixes\/intro-ai\/draft$/);
    assert.equal(calls[0]?.init?.body, JSON.stringify({ fix_ids: ["fix_edge_intro_search"] }));
    assert.match(calls[1]?.url ?? "", /\/api\/v1\/graph\/qa\/intro-ai$/);
    assert.match(calls[2]?.url ?? "", /\/api\/v1\/graph\/qa\/draft\/intro-ai$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
