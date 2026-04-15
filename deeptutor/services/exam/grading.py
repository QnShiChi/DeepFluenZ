from __future__ import annotations


def _choice_ids(response: dict) -> list[str]:
    return [str(item) for item in response.get("choice_ids", [])]


def grade_attempt(artifact: dict, attempt: dict) -> dict:
    answer_map = {
        item["question_id"]: item.get("response", {})
        for item in attempt.get("answers", [])
    }
    question_results = []
    total_score = 0
    max_score = 0

    for question in artifact.get("questions", []):
        max_points = int(question.get("points", 0))
        max_score += max_points
        response = answer_map.get(question["question_id"], {})
        kind = question.get("kind")
        grader_key = question.get("grader_key", {})
        awarded = 0
        is_correct = False
        matched_concepts: list[str] = []
        missing_concepts: list[str] = []
        confidence = 1.0

        if kind == "multiple_choice":
            is_correct = sorted(_choice_ids(response)) == sorted(grader_key.get("correct_choice_ids", []))
            awarded = max_points if is_correct else 0
        elif kind == "true_false":
            is_correct = response.get("boolean") == grader_key.get("correct_boolean")
            awarded = max_points if is_correct else 0
        elif kind == "matching":
            is_correct = sorted(response.get("pairs", []), key=str) == sorted(
                grader_key.get("correct_pairs", []),
                key=str,
            )
            awarded = max_points if is_correct else 0
        else:
            expected = {item.lower() for item in grader_key.get("expected_concepts", [])}
            submitted = str(response.get("text", "")).lower()
            matched_concepts = sorted([item for item in expected if item in submitted])
            missing_concepts = sorted(expected - set(matched_concepts))
            awarded = min(max_points, len(matched_concepts))
            is_correct = awarded == max_points and max_points > 0
            confidence = 0.6 if missing_concepts else 0.9

        total_score += awarded
        question_results.append(
            {
                "question_id": question["question_id"],
                "awarded_points": awarded,
                "max_points": max_points,
                "is_correct": is_correct,
                "feedback": grader_key.get("explanation", ""),
                "confidence": confidence,
                "matched_concepts": matched_concepts,
                "missing_concepts": missing_concepts,
            }
        )

    return {
        "total_score": total_score,
        "max_score": max_score,
        "question_results": question_results,
        "competency_breakdown": [],
        "recommended_review": [],
    }
