from dataclasses import dataclass


@dataclass(frozen=True)
class SourcePage:
    number: int
    text: str


@dataclass(frozen=True)
class StudyDocument:
    filename: str
    pages: list[SourcePage]
