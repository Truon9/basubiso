import json

from mistralai import Mistral

from app.domain.models import StudyDocument


SYSTEM_PROMPT = """Bạn là trợ lý tạo tài liệu học tập. Chỉ dùng dữ kiện có trong PDF.
Trả về JSON hợp lệ, không markdown, đúng schema:
{
  "summary": "string",
  "flashcards": [{"front":"string","back":"string","source_pages":[1]}],
  "questions": [{"question":"string","options":["string","string","string","string"],"answer_index":0,"explanation":"string","source_pages":[1]}]
}
Tạo tối đa 12 flashcards và 10 câu hỏi. Nếu không đủ dữ kiện, trả mảng rỗng; không suy diễn."""


class MistralGenerator:
    def __init__(self, api_key: str, model: str):
        self._client = Mistral(api_key=api_key)
        self._model = model

    async def generate(self, document: StudyDocument) -> dict:
        # V1 giới hạn để tránh vượt token; V2 sẽ map/reduce theo chunk + queue.
        source = "\n\n".join(f"[Trang {p.number}]\n{p.text}" for p in document.pages)[:45000]
        response = await self._client.chat.complete_async(
            model=self._model,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": source}],
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
