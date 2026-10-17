import json

from mistralai import Mistral

from app.domain.models import GenerationRequest


SYSTEM_PROMPT = """You create study materials strictly from the supplied PDF text. Return valid JSON, not markdown:
{
  "summary": "string",
  "flashcards": [{"front":"string","back":"string","source_pages":[1]}],
  "questions": [{"question":"string","options":["string","string","string","string"],"answer_index":0,"explanation":"string","source_pages":[1]}]
}
Create the exact requested numbers of distinct flashcards and multiple-choice questions, with four distinct options per question and one correct answer. Cover different facts and concepts throughout the document. Never reuse or paraphrase a previous front/question listed in the request. Preserve the language of the PDF. If the source lacks enough facts, return only what it supports; never invent facts."""


def build_user_prompt(request: GenerationRequest) -> str:
    chunks = []
    current = ""
    for page in request.document.pages:
        text = page.text
        while text:
            space = 45000 - len(current) - len(f"[Page {page.number}]\n") - 2
            if space <= 0:
                chunks.append(current)
                current = ""
                continue
            section = f"[Page {page.number}]\n{text[:space]}"
            current = f"{current}\n\n{section}" if current else section
            text = text[space:]
            if text:
                chunks.append(current)
                current = ""
    if current:
        chunks.append(current)
    chunk_index = (len(request.previous_questions) // 20 + request.attempt) % len(chunks)
    source = chunks[chunk_index]
    previous_cards = "\n".join(f"- {item}" for item in request.previous_flashcards[-100:]) or "None"
    previous_questions = "\n".join(f"- {item}" for item in request.previous_questions[-100:]) or "None"
    return (
        f"Create exactly {request.flashcard_count} NEW flashcards and {request.question_count} NEW questions.\n"
        f"Previously used flashcard fronts (avoid same fact/wording):\n{previous_cards}\n"
        f"Previously used questions (avoid same fact/wording):\n{previous_questions}\n"
        f"PDF text:\n{source}"
    )


class MistralGenerator:
    def __init__(self, api_key: str, model: str):
        self._client = Mistral(api_key=api_key)
        self._model = model

    async def generate(self, request: GenerationRequest) -> dict:
        response = await self._client.chat.complete_async(
            model=self._model,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": build_user_prompt(request)}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
