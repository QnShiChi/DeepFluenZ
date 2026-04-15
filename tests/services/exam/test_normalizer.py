from pydantic import ValidationError

from deeptutor.services.exam.models import ExamArtifact


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
