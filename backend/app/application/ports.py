from typing import Protocol

from app.domain.models import StudyDocument


class PdfTextExtractor(Protocol):
    def extract(self, filename: str, content: bytes) -> StudyDocument: ...


class StudyMaterialGenerator(Protocol):
    async def generate(self, document: StudyDocument) -> dict: ...
