from app.application.ports import PdfTextExtractor, StudyMaterialGenerator
from app.application.material_generation import generate_unique_material


class GenerateStudySet:
    def __init__(self, extractor: PdfTextExtractor, generator: StudyMaterialGenerator):
        self._extractor = extractor
        self._generator = generator

    async def execute(self, filename: str, content: bytes) -> dict:
        document = self._extractor.extract(filename, content)
        if not document.pages:
            raise ValueError("Không thể trích xuất văn bản từ PDF này.")
        material = await generate_unique_material(document, self._generator)
        return {**material, "source_pages": [{"number": page.number, "text": page.text} for page in document.pages]}
