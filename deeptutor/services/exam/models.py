from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QuestionKind = Literal["multiple_choice", "true_false", "short_answer", "matching"]
ExamMode = Literal["timed", "practice"]


class StudentView(BaseModel):
    model_config = ConfigDict(extra="allow")


class GraderKey(BaseModel):
    model_config = ConfigDict(extra="allow")


class ExamQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str
    kind: QuestionKind
    prompt: str
    points: int = Field(ge=1)
    chapter: str = ""
    section: str = ""
    competency_tags: list[str] = Field(default_factory=list)
    difficulty: str = ""
    student_view: StudentView
    grader_key: GraderKey


class ExamArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam_id: str
    title: str
    mode: ExamMode
    source_session_id: str
    knowledge_base: str = ""
    total_points: int = Field(ge=0)
    questions: list[ExamQuestion] = Field(default_factory=list)
