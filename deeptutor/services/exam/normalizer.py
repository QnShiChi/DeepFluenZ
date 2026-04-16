from __future__ import annotations

import re
from uuid import uuid4

from deeptutor.services.exam.models import ExamArtifact, ExamQuestion


def _map_kind(question_type: str) -> str:
    mapping = {
        "choice": "multiple_choice",
        "multiple_choice": "multiple_choice",
        "true_false": "true_false",
        "matching": "matching",
        "written": "short_answer",
        "coding": "short_answer",
        "short_answer": "short_answer",
        "essay": "short_answer",
    }
    return mapping.get(question_type or "", "short_answer")


def _extract_options_from_prompt(prompt: str) -> tuple[str, dict[str, str]]:
    """Extract A-D options from a prompt string that embedded them.

    Returns (clean_prompt, options_dict).
    """
    pattern = re.compile(
        r"\n\s*([A-Da-d])[).\u200b\-]\s*(.+)",
        re.MULTILINE,
    )
    options: dict[str, str] = {}
    clean_lines: list[str] = []

    for line in prompt.split("\n"):
        m = pattern.match(line)
        if m:
            key = m.group(1).upper()
            options[key] = m.group(2).strip()
            continue
        clean_lines.append(line)

    clean_prompt = "\n".join(clean_lines).strip()
    return clean_prompt, options


def _build_student_view(kind: str, item: dict, prompt: str) -> dict:
    if kind == "multiple_choice":
        raw_options = item.get("options") or {}
        if not raw_options:
            _, raw_options = _extract_options_from_prompt(prompt)

        return {
            "choices": [
                {"id": key, "label": value}
                for key, value in raw_options.items()
                if value
            ],
            "allow_multiple": False,
        }
    if kind == "matching":
        return {
            "left_items": item.get("left_items") or [],
            "right_items": item.get("right_items") or [],
        }
    return {
        "input_mode": "textarea",
        "max_length": 800,
    }


def _build_grader_key(kind: str, item: dict) -> dict:
    explanation = str(item.get("explanation") or "")
    correct_answer = item.get("correct_answer")
    if kind == "multiple_choice":
        return {
            "correct_choice_ids": [str(correct_answer or "").strip()],
            "explanation": explanation,
        }
    if kind == "true_false":
        return {
            "correct_boolean": bool(correct_answer),
            "explanation": explanation,
        }
    if kind == "matching":
        return {
            "correct_pairs": item.get("correct_pairs") or [],
            "explanation": explanation,
        }
    return {
        "rubric": item.get("rubric") or [],
        "expected_concepts": item.get("expected_concepts") or [],
        "sample_answer": str(correct_answer or ""),
        "explanation": explanation,
    }


def normalize_legacy_exam_artifact(
    *,
    session_id: str,
    knowledge_base: str,
    mode: str,
    title: str,
    questions: list[dict],
) -> ExamArtifact:
    typed_questions: list[ExamQuestion] = []
    total_points = 0

    for index, item in enumerate(questions):
        kind = _map_kind(str(item.get("question_type", "")))
        raw_prompt = str(item.get("question") or item.get("prompt") or "").strip()
        points = int(item.get("points", 1) or 1)
        total_points += points
        concentration = str(item.get("concentration") or "").strip()

        effective_prompt = raw_prompt
        if kind == "multiple_choice" and not (item.get("options")):
            effective_prompt, _ = _extract_options_from_prompt(raw_prompt)

        typed_questions.append(
            ExamQuestion(
                question_id=str(item.get("question_id") or f"q{index + 1}"),
                kind=kind,
                prompt=effective_prompt,
                points=points,
                chapter=str(item.get("chapter") or ""),
                section=str(item.get("section") or ""),
                competency_tags=[concentration] if concentration else [],
                difficulty=str(item.get("difficulty") or ""),
                student_view=_build_student_view(kind, item, raw_prompt),
                grader_key=_build_grader_key(kind, item),
            )
        )

    return ExamArtifact(
        exam_id=f"exam_{uuid4().hex}",
        title=title,
        mode="practice" if mode == "practice" else "timed",
        source_session_id=session_id,
        knowledge_base=knowledge_base,
        total_points=total_points,
        questions=typed_questions,
    )
