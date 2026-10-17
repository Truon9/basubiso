import json

from google import genai
from google.genai import types

from app.domain.models import GenerationRequest
from app.infrastructure.ai.mistral_generator import SYSTEM_PROMPT, build_user_prompt


class GeminiGenerator:
    def __init__(self, api_key: str, model: str):
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def generate(self, request: GenerationRequest) -> dict:
        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=build_user_prompt(request),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.7,
            ),
        )
        return json.loads(response.text)
