import json

from google import genai
from google.genai import types

from app.domain.models import StudyDocument
from app.infrastructure.ai.mistral_generator import SYSTEM_PROMPT


class GeminiGenerator:
    def __init__(self, api_key: str, model: str):
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def generate(self, document: StudyDocument) -> dict:
        source = "\n\n".join(f"[Page {page.number}]\n{page.text}" for page in document.pages)[:45000]
        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=source,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        return json.loads(response.text)
