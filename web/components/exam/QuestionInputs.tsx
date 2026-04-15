"use client";

import type { ExamQuestion } from "@/lib/exam-types";

interface QuestionInputsProps {
  question: ExamQuestion;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

export default function QuestionInputs({
  question,
  value,
  onChange,
  disabled = false,
}: QuestionInputsProps) {
  if (question.kind === "multiple_choice") {
    const selectedIds = Array.isArray(value.choice_ids)
      ? value.choice_ids.map((item) => String(item))
      : [];
    const studentView = question.student_view as {
      choices?: Array<{ id: string; label: string }>;
      allow_multiple?: boolean;
    };
    const choices = studentView.choices ?? [];
    const allowMultiple = Boolean(studentView.allow_multiple);

    return (
      <div className="space-y-2">
        {choices.map((choice) => {
          const checked = selectedIds.includes(choice.id);
          return (
            <label
              key={choice.id}
              className="flex items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]"
            >
              <input
                type={allowMultiple ? "checkbox" : "radio"}
                name={question.question_id}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  if (allowMultiple) {
                    onChange({
                      choice_ids: checked
                        ? selectedIds.filter((item) => item !== choice.id)
                        : [...selectedIds, choice.id],
                    });
                    return;
                  }
                  onChange({ choice_ids: [choice.id] });
                }}
              />
              <span>{choice.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (question.kind === "true_false") {
    const selected = typeof value.boolean === "boolean" ? value.boolean : null;
    return (
      <div className="flex gap-3">
        {[true, false].map((option) => (
          <label
            key={String(option)}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)]"
          >
            <input
              type="radio"
              name={question.question_id}
              checked={selected === option}
              disabled={disabled}
              onChange={() => onChange({ boolean: option })}
            />
            <span>{option ? "True" : "False"}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.kind === "matching") {
    const studentView = question.student_view as {
      left_items?: Array<{ id: string; label: string }>;
      right_items?: Array<{ id: string; label: string }>;
    };
    const leftItems = studentView.left_items ?? [];
    const rightItems = studentView.right_items ?? [];
    const pairs = Array.isArray(value.pairs)
      ? (value.pairs as Array<{ left_id: string; right_id: string }>)
      : [];

    return (
      <div className="space-y-2">
        {leftItems.map((leftItem) => {
          const currentPair = pairs.find((pair) => pair.left_id === leftItem.id);
          return (
            <div key={leftItem.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-[120px] text-[var(--foreground)]">{leftItem.label}</span>
              <select
                value={currentPair?.right_id ?? ""}
                disabled={disabled}
                onChange={(event) => {
                  const nextPairs = pairs.filter((pair) => pair.left_id !== leftItem.id);
                  if (event.target.value) {
                    nextPairs.push({ left_id: leftItem.id, right_id: event.target.value });
                  }
                  onChange({ pairs: nextPairs });
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              >
                <option value="">Select</option>
                {rightItems.map((rightItem) => (
                  <option key={rightItem.id} value={rightItem.id}>
                    {rightItem.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <textarea
      value={typeof value.text === "string" ? value.text : ""}
      onChange={(event) => onChange({ text: event.target.value })}
      disabled={disabled}
      rows={4}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none"
      placeholder="Type your answer..."
    />
  );
}
