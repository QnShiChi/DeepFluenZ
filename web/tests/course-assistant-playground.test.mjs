import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCourseAssistantRequest,
  normalizeCourseAssistantConfig,
} from "../lib/course-assistant-playground.ts";

test("normalizeCourseAssistantConfig falls back to safe defaults", () => {
  const config = normalizeCourseAssistantConfig({
    mode: "invalid",
    top_k: 0,
    num_questions: -3,
    output_format: "xml",
    include_sources: "yes",
  });

  assert.deepEqual(config, {
    mode: "qa",
    top_k: 5,
    num_questions: 3,
    difficulty: "",
    question_type: "",
    chapter: "",
    section: "",
    output_format: "markdown",
    include_sources: true,
  });
});

test("buildCourseAssistantRequest keeps explicit qa input and config", () => {
  const request = buildCourseAssistantRequest(
    "Overfitting la gi?",
    normalizeCourseAssistantConfig({ mode: "qa", top_k: 7, include_sources: false }),
  );

  assert.equal(request.content, "Overfitting la gi?");
  assert.deepEqual(request.config, {
    mode: "qa",
    top_k: 7,
    output_format: "markdown",
    include_sources: false,
  });
});

test("buildCourseAssistantRequest synthesizes exam prompt from config when input is empty", () => {
  const request = buildCourseAssistantRequest(
    "",
    normalizeCourseAssistantConfig({
      mode: "exam",
      num_questions: 4,
      difficulty: "hard",
      question_type: "multiple_choice",
      chapter: "Machine Learning Basics",
      top_k: 6,
    }),
  );

  assert.equal(
    request.content,
    "Generate 4 hard multiple_choice questions for Machine Learning Basics.",
  );
  assert.deepEqual(request.config, {
    mode: "exam",
    top_k: 6,
    num_questions: 4,
    difficulty: "hard",
    question_type: "multiple_choice",
    chapter: "Machine Learning Basics",
    output_format: "markdown",
    include_sources: true,
  });
});

test("buildCourseAssistantRequest synthesizes summary prompt from section context", () => {
  const request = buildCourseAssistantRequest(
    "",
    normalizeCourseAssistantConfig({
      mode: "summary",
      chapter: "Neural Networks",
      section: "Backpropagation",
      output_format: "json",
    }),
  );

  assert.equal(
    request.content,
    "Summarize Backpropagation in Neural Networks.",
  );
  assert.deepEqual(request.config, {
    mode: "summary",
    top_k: 5,
    chapter: "Neural Networks",
    section: "Backpropagation",
    output_format: "json",
    include_sources: true,
  });
});
