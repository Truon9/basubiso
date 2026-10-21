from collections.abc import AsyncIterator, Sequence

from google import genai
from google.genai import types
from mistralai import Mistral

from app.application.errors import RateLimitExhaustedError
from app.application.ports import ChatProvider
from app.infrastructure.ai.failover_generator import _is_rate_limited


class MistralChatProvider:
    def __init__(self, api_key: str, model: str):
        self._client = Mistral(api_key=api_key)
        self._model = model

    async def reply(self, system_prompt: str, messages: list[dict[str, str]]) -> str:
        response = await self._client.chat.complete_async(
            model=self._model,
            messages=[{"role": "system", "content": system_prompt}, *messages],
        )
        answer = response.choices[0].message.content
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("AI provider returned an empty chat response.")
        return answer.strip()

    async def stream_reply(self, system_prompt: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        events = await self._client.chat.stream_async(
            model=self._model,
            messages=[{"role": "system", "content": system_prompt}, *messages],
        )
        async for event in events:
            choices = event.data.choices
            if not choices:
                continue
            content = choices[0].delta.content
            if isinstance(content, str) and content:
                yield content
            elif isinstance(content, list):
                for part in content:
                    part_text = getattr(part, "text", None)
                    if isinstance(part_text, str) and part_text:
                        yield part_text


class GeminiChatProvider:
    def __init__(self, api_key: str, model: str):
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def reply(self, system_prompt: str, messages: list[dict[str, str]]) -> str:
        contents = [
            types.Content(
                role="model" if item["role"] == "assistant" else "user",
                parts=[types.Part.from_text(text=item["content"])],
            )
            for item in messages
        ]
        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=system_prompt, temperature=0.5),
        )
        if not response.text or not response.text.strip():
            raise ValueError("AI provider returned an empty chat response.")
        return response.text.strip()

    async def stream_reply(self, system_prompt: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        contents = [
            types.Content(
                role="model" if item["role"] == "assistant" else "user",
                parts=[types.Part.from_text(text=item["content"])],
            )
            for item in messages
        ]
        chunks = await self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=system_prompt, temperature=0.5),
        )
        async for chunk in chunks:
            if chunk.text:
                yield chunk.text


class FailoverChatProvider:
    def __init__(self, providers: Sequence[ChatProvider]):
        self._providers = providers

    async def reply(self, system_prompt: str, messages: list[dict[str, str]]) -> str:
        for provider in self._providers:
            try:
                return await provider.reply(system_prompt, messages)
            except Exception as error:
                if not _is_rate_limited(error):
                    raise
        raise RateLimitExhaustedError("All configured AI keys are rate-limited.")

    async def stream_reply(self, system_prompt: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        for provider in self._providers:
            started = False
            try:
                async for chunk in provider.stream_reply(system_prompt, messages):
                    if chunk:
                        started = True
                        yield chunk
                if not started:
                    raise ValueError("AI provider returned an empty chat stream.")
                return
            except Exception as error:
                if started or not _is_rate_limited(error):
                    raise
        raise RateLimitExhaustedError("All configured AI keys are rate-limited.")
