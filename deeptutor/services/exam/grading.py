from __future__ import annotations
from typing import Any

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
    competency_breakdown = []
    recommended_review = []

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
        tag_agg: dict[str, dict[str, Any]] = {}
        tags = question.get("competency_tags") or [""]
        for tag in tags:
            if not tag:
                continue
            if tag not in tag_agg:
                tag_agg[tag] = {
                    "awarded_points": 0,
                    "max_points": 0,
                    "chapter": question.get("chapter", ""),
                    "section": question.get("section", ""),
                }
            tag_agg[tag]["awarded_points"] += awarded
            tag_agg[tag]["max_points"] += max_points

            if awarded < max_points:
                rec_key = f"{question.get('chapter', '')}|{question.get('section', '')}|{tag}"
                if not any(r.get("_key") == rec_key for r in recommended_review):
                    recommended_review.append(
                        {
                            "_key": rec_key,
                            "chapter": question.get("chapter", ""),
                            "section": question.get("section", ""),
                            "competency_tag": tag,
                            "priority": "high",
                            "reason": f"Missed points on {tag}",
                        }
                    )
        
        for key, value in tag_agg.items():
            existing = next((item for item in competency_breakdown if item["competency_tag"] == key), None)
            if existing:
                existing["awarded_points"] += value["awarded_points"]
                existing["max_points"] += value["max_points"]
                existing["accuracy"] = (existing["awarded_points"] / existing["max_points"]) if existing["max_points"] else 0
                existing["priority"] = "high" if existing["awarded_points"] < existing["max_points"] else "low"
            else:
                competency_breakdown.append(
                    {
                        "competency_tag": key,
                        "chapter": value["chapter"],
                        "section": value["section"],
                        "awarded_points": value["awarded_points"],
                        "max_points": value["max_points"],
                        "accuracy": (value["awarded_points"] / value["max_points"]) if value["max_points"] else 0,
                        "priority": "high" if value["awarded_points"] < value["max_points"] else "low",
                    }
                )

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
        "competency_breakdown": competency_breakdown,
        "recommended_review": recommended_review,
    }
