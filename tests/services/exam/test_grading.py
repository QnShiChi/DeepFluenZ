from deeptutor.services.exam.grading import grade_attempt


def test_grade_attempt_scores_multiple_choice_rule_based() -> None:
    artifact = {
        "exam_id": "exam_1",
        "title": "Midterm",
        "mode": "timed",
        "source_session_id": "session_1",
        "knowledge_base": "kb",
        "total_points": 2,
        "questions": [
            {
                "question_id": "q1",
                "kind": "multiple_choice",
                "prompt": "Capital of France?",
                "points": 2,
                "chapter": "Maps",
                "section": "Europe",
                "competency_tags": ["recall"],
                "difficulty": "easy",
                "student_view": {
                    "choices": [
                        {"id": "A", "label": "Berlin"},
                        {"id": "B", "label": "Paris"},
                    ],
                    "allow_multiple": False,
                },
                "grader_key": {"correct_choice_ids": ["B"], "explanation": "Paris is correct."},
            }
        ],
    }
    attempt = {"answers": [{"question_id": "q1", "response": {"choice_ids": ["B"]}}]}

    report = grade_attempt(artifact, attempt)
    assert report["total_score"] == 2
    assert report["question_results"][0]["is_correct"] is True


def test_grade_attempt_short_answer_returns_concept_feedback() -> None:
    artifact = {
        "exam_id": "exam_2",
        "title": "Concepts",
        "mode": "timed",
        "source_session_id": "session_1",
        "knowledge_base": "kb",
        "total_points": 2,
        "questions": [
            {
                "question_id": "q2",
                "kind": "short_answer",
                "prompt": "Explain the link between derivative and continuity.",
                "points": 2,
                "chapter": "Calculus",
                "section": "Derivatives",
                "competency_tags": ["conceptual-understanding"],
                "difficulty": "medium",
                "student_view": {"input_mode": "textarea"},
                "grader_key": {
                    "expected_concepts": ["derivative", "continuity"],
                    "explanation": "Both concepts should be mentioned.",
                },
            }
        ],
    }
    attempt = {"answers": [{"question_id": "q2", "response": {"text": "A derivative implies continuity in many cases."}}]}

    report = grade_attempt(artifact, attempt)
    result = report["question_results"][0]
    assert "derivative" in result["matched_concepts"]
    assert "continuity" in result["matched_concepts"]
    assert result["confidence"] >= 0.9


def test_grade_attempt_builds_competency_breakdown_for_wrong_answers() -> None:
    artifact = {
        "questions": [
            {
                "question_id": "q1",
                "kind": "multiple_choice",
                "points": 2,
                "chapter": "Limits",
                "section": "One-sided limits",
                "competency_tags": ["conceptual-understanding"],
                "grader_key": {"correct_choice_ids": ["B"], "explanation": "Paris is correct."},
            }
        ]
    }
    attempt = {"answers": [{"question_id": "q1", "response": {"choice_ids": ["A"]}}]}

    report = grade_attempt(artifact, attempt)
    assert report["competency_breakdown"][0]["competency_tag"] == "conceptual-understanding"
    assert report["recommended_review"][0]["chapter"] == "Limits"
