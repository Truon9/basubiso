import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.application.study_chat import StudyChat, build_course_context

try:
    from fastapi import HTTPException
    from app.infrastructure.ai.chat_providers import FailoverChatProvider
    from app.presentation.http import main
except ModuleNotFoundError:
    main = None


class FakeSession:
    def __init__(self, course):
        self.course = course

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def get(self, _model, _id):
        return self.course


@unittest.skipIf(main is None, "Backend dependencies are not installed in this interpreter")
class ChatEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_chat_forwards_history_and_uses_selected_subject_context(self):
        document = SimpleNamespace(
            filename="biology.pdf",
            summary="Cells contain a nucleus.",
            source_pages=[{"number": 2, "text": "The nucleus stores DNA."}],
            created_at=datetime(2026, 1, 1),
        )
        course = SimpleNamespace(owner_id=1, name="Biology", documents=[document])
        provider = SimpleNamespace(reply=AsyncMock(return_value="The nucleus stores DNA."))
        payload = main.ChatRequest(
            message="What does the nucleus do?",
            course_id=7,
            language="en",
            history=[main.ChatMessage(role="user", content="Hi"), main.ChatMessage(role="assistant", content="Hello")],
        )
        with patch.object(main, "SessionLocal", return_value=FakeSession(course)), patch.object(main, "chat_provider", return_value=provider):
            result = await main.chat(payload, SimpleNamespace(id=1))
        self.assertEqual(result["reply"], "The nucleus stores DNA.")
        system_prompt, messages = provider.reply.await_args.args
        self.assertIn("Biology", system_prompt)
        self.assertIn("Page 2", system_prompt)
        self.assertEqual([message["role"] for message in messages], ["user", "assistant", "user"])

    async def test_chat_rejects_missing_subject(self):
        payload = main.ChatRequest(message="Help", course_id=999)
        with patch.object(main, "SessionLocal", return_value=FakeSession(None)):
            with self.assertRaises(HTTPException) as caught:
                await main.chat(payload, SimpleNamespace(id=1))
        self.assertEqual(caught.exception.status_code, 404)

    async def test_chat_fails_over_on_rate_limit(self):
        primary = SimpleNamespace(reply=AsyncMock(side_effect=Exception("429 rate limited")))
        backup = SimpleNamespace(reply=AsyncMock(return_value="Use spaced repetition."))
        assistant = StudyChat(FailoverChatProvider([primary, backup]))
        answer = await assistant.reply("How should I study?", [], "en")
        self.assertEqual(answer, "Use spaced repetition.")
        backup.reply.assert_awaited_once()

    async def test_stream_endpoint_emits_deltas_and_done(self):
        async def chunks(_system_prompt, _messages):
            yield "Xin "
            yield "chào"

        provider = SimpleNamespace(stream_reply=chunks)
        with patch.object(main, "chat_provider", return_value=provider):
            response = await main.stream_chat(main.ChatRequest(message="Hello", language="vi"), SimpleNamespace(id=1))
            events = [part async for part in response.body_iterator]
        self.assertEqual(response.media_type, "text/event-stream")
        self.assertIn('"text": "Xin "', events[0])
        self.assertIn('"text": "chào"', events[1])
        self.assertIn("event: done", events[2])

    async def test_stream_fails_over_before_first_chunk(self):
        async def limited(_system_prompt, _messages):
            raise Exception("429 rate limited")
            yield "unreachable"

        async def backup(_system_prompt, _messages):
            yield "Ready"

        providers = FailoverChatProvider([
            SimpleNamespace(stream_reply=limited),
            SimpleNamespace(stream_reply=backup),
        ])
        chunks = [part async for part in providers.stream_reply("prompt", [{"role": "user", "content": "Hi"}])]
        self.assertEqual(chunks, ["Ready"])


class StudyChatApplicationTests(unittest.IsolatedAsyncioTestCase):
    async def test_chat_without_subject_uses_general_assistant(self):
        provider = SimpleNamespace(reply=AsyncMock(return_value="Try short reviews."))
        assistant = StudyChat(provider)
        await assistant.reply("Any tips?", [], "vi")
        prompt, _ = provider.reply.await_args.args
        self.assertIn("Vietnamese", prompt)
        self.assertNotIn("Reference material:", prompt)

    async def test_stream_preserves_provider_chunks(self):
        seen = []

        async def stream_reply(prompt, messages):
            seen.append((prompt, messages))
            yield "First "
            yield "second"

        assistant = StudyChat(SimpleNamespace(stream_reply=stream_reply))
        chunks = [chunk async for chunk in assistant.stream("Explain", [], "en")]
        self.assertEqual(chunks, ["First ", "second"])
        self.assertEqual(seen[0][1][-1], {"role": "user", "content": "Explain"})

    def test_context_is_bounded(self):
        document = SimpleNamespace(filename="large.pdf", summary="x" * 20000, source_pages=[], created_at=datetime(2026, 1, 1))
        self.assertLessEqual(len(build_course_context([document])), 16000)


if __name__ == "__main__":
    unittest.main()
