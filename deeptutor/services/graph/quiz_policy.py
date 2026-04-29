from __future__ import annotations


def determine_graph_quiz_count(
    difficulty: str,
    failure_severity: str | None,
) -> int:
    base = {"easy": 3, "medium": 5, "hard": 7}.get(difficulty, 5)
    adjustment = {"mild": 0, "moderate": 1, "severe": 2}.get(failure_severity or "", 0)
    return min(base + adjustment, 9)


def determine_remediation_quiz_count(difficulty: str, attempt_count: int) -> int:
    base = {"easy": 2, "medium": 3, "hard": 4}.get(difficulty, 3)
    return min(base + (1 if attempt_count > 0 else 0), 5)


def determine_graph_quiz_pass_threshold(question_count: int) -> int:
    if question_count <= 3:
        return 2
    if question_count <= 5:
        return 4
    return 5


def determine_failure_severity(
    *,
    score_ratio: float,
    weak_concepts: list[str],
    prerequisite_weakness: bool,
) -> str:
    if prerequisite_weakness or score_ratio < 0.35:
        return "severe"
    if score_ratio < 0.7 or len(weak_concepts) >= 2:
        return "moderate"
    return "mild"


def normalize_graph_quiz_kinds(question_kinds: list[str]) -> list[str]:
    return ["multiple_choice"]
