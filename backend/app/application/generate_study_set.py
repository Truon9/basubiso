from app.application.ports import PdfTextExtractor, StudyMaterialGenerator


class GenerateStudySet:
    def __init__(self, extractor: PdfTextExtractor, generator: StudyMaterialGenerator):
        self._extractor = extractor
        self._generator = generator

    async def execute(self, filename: str, content: bytes) -> dict:
        document = self._extractor.extract(filename, content)
        if not document.pages:
            raise ValueError("Không thể trích xuất văn bản từ PDF này.")
        return await self._generator.generate(document)
