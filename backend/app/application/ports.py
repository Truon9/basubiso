from collections.abc import AsyncIterator
from typing import Protocol

from app.domain.models import GenerationRequest, StudyDocument


class PdfTextExtractor(Protocol):
    def extract(self, filename: str, content: bytes) -> StudyDocument: ...


class StudyMaterialGenerator(Protocol):
    async def generate(self, request: GenerationRequest) -> dict: ...


class ChatProvider(Protocol):
    async def reply(self, system_prompt: str, messages: list[dict[str, str]]) -> str: ...
    def stream_reply(self, system_prompt: str, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...
