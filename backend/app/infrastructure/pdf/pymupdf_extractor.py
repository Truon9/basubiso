import fitz

from app.domain.models import SourcePage, StudyDocument


class PyMuPdfExtractor:
    def extract(self, filename: str, content: bytes) -> StudyDocument:
        pdf = fitz.open(stream=content, filetype="pdf")
        pages = [
            SourcePage(number=index + 1, text=page.get_text("text").strip())
            for index, page in enumerate(pdf)
            if page.get_text("text").strip()
        ]
        return StudyDocument(filename=filename, pages=pages)
