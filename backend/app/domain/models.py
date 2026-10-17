from dataclasses import dataclass


@dataclass(frozen=True)
class SourcePage:
    number: int
    text: str


@dataclass(frozen=True)
class StudyDocument:
    filename: str
    pages: list[SourcePage]


@dataclass(frozen=True)
class GenerationRequest:
    document: StudyDocument
    flashcard_count: int
    question_count: int
    previous_flashcards: tuple[str, ...] = ()
    previous_questions: tuple[str, ...] = ()
    attempt: int = 0
