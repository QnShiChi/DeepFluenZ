from pydantic import ValidationError

from deeptutor.services.exam.models import ExamArtifact
from deeptutor.services.exam.normalizer import normalize_legacy_exam_artifact


def test_exam_artifact_requires_supported_question_kind() -> None:
    payload = {
        "exam_id": "exam_1",
        "title": "Test",
        "mode": "timed",
        "source_session_id": "session_1",
        "knowledge_base": "kb",
        "total_points": 2,
        "questions": [
            {
                "question_id": "q1",
                "kind": "essay",
                "prompt": "Explain limits",
                "points": 2,
                "chapter": "Limits",
                "section": "Intro",
                "competency_tags": ["conceptual-understanding"],
                "difficulty": "medium",
                "student_view": {},
                "grader_key": {},
            }
        ],
    }

    try:
        ExamArtifact.model_validate(payload)
    except ValidationError as exc:
        assert "essay" in str(exc)
    else:
        raise AssertionError("Expected validation error for unsupported kind")


def test_normalize_legacy_choice_question_maps_to_multiple_choice() -> None:
    legacy_questions = [
        {
            "question_id": "q1",
            "question": "Capital of France?",
            "question_type": "choice",
            "options": {"A": "Berlin", "B": "Paris"},
            "correct_answer": "B",
            "explanation": "Paris is the capital.",
            "difficulty": "easy",
            "concentration": "geography",
        }
    ]

    artifact = normalize_legacy_exam_artifact(
        session_id="session_1",
        knowledge_base="world-history",
        mode="timed",
        title="Legacy import",
        questions=legacy_questions,
    )

    question = artifact.questions[0]
    assert question.kind == "multiple_choice"
    assert question.student_view.model_dump()["choices"][1]["id"] == "B"
    assert question.grader_key.model_dump()["correct_choice_ids"] == ["B"]
