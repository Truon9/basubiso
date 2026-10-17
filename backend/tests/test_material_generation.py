import asyncio
import unittest

from app.application.material_generation import (
    FLASHCARD_COUNT,
    QUESTION_COUNT,
    InsufficientMaterialError,
    generate_unique_material,
)
from app.domain.models import SourcePage, StudyDocument


def material(card_start=0, question_start=0, cards=FLASHCARD_COUNT, questions=QUESTION_COUNT):
    return {
        "summary": "A summary",
        "flashcards": [
            {"front": f"Concept {index}", "back": f"Explanation {index}", "source_pages": [1]}
            for index in range(card_start, card_start + cards)
        ],
        "questions": [
            {
                "question": f"What is distinct concept {index}?",
                "options": [f"Correct {index}", f"Wrong {index} A", f"Wrong {index} B", f"Wrong {index} C"],
                "answer_index": 0,
                "explanation": f"Because of fact {index}.",
                "source_pages": [1],
            }
            for index in range(question_start, question_start + questions)
        ],
    }


class FakeGenerator:
    def __init__(self, responses):
        self.responses = responses
        self.requests = []

    async def generate(self, request):
        self.requests.append(request)
        return self.responses[len(self.requests) - 1]


class MaterialGenerationTests(unittest.TestCase):
    def setUp(self):
        self.document = StudyDocument("test.pdf", [SourcePage(1, "Source text")])

    def test_generates_exact_counts_and_preserves_correct_answer_after_shuffle(self):
        generator = FakeGenerator([material()])
        result = asyncio.run(generate_unique_material(self.document, generator))
        self.assertEqual(len(result["flashcards"]), 10)
        self.assertEqual(len(result["questions"]), 20)
        self.assertEqual([sum(question["answer_index"] == index for question in result["questions"]) for index in range(4)], [5, 5, 5, 5])
        for index, question in enumerate(result["questions"]):
            self.assertEqual(question["options"][question["answer_index"]], f"Correct {index}")

    def test_retries_duplicates_and_requests_only_missing_items(self):
        generator = FakeGenerator([material(), material(10, 20)])
        result = asyncio.run(generate_unique_material(
            self.document, generator,
            previous_flashcards=["Concept 0"],
            previous_questions=["What is distinct concept 0?"],
        ))
        self.assertEqual(len(result["flashcards"]), 10)
        self.assertEqual(len(result["questions"]), 20)
        self.assertEqual(generator.requests[1].flashcard_count, 1)
        self.assertEqual(generator.requests[1].question_count, 1)
        self.assertNotIn("Concept 0", [card["front"] for card in result["flashcards"]])

    def test_fails_instead_of_saving_incomplete_set(self):
        generator = FakeGenerator([{"summary": "", "flashcards": [], "questions": []}] * 3)
        with self.assertRaises(InsufficientMaterialError):
            asyncio.run(generate_unique_material(self.document, generator))
        self.assertEqual(len(generator.requests), 3)


if __name__ == "__main__":
    unittest.main()
