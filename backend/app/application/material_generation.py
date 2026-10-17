import re
import unicodedata
from difflib import SequenceMatcher
from random import SystemRandom

from app.application.ports import StudyMaterialGenerator
from app.domain.models import GenerationRequest, StudyDocument


FLASHCARD_COUNT = 10
QUESTION_COUNT = 20
MAX_GENERATION_ATTEMPTS = 3


class InsufficientMaterialError(Exception):
    """The source/model could not produce a complete, non-repeating set."""


def _normalized(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(re.findall(r"\w+", value, flags=re.UNICODE))


def _is_repeat(value: str, seen: list[str]) -> bool:
    normalized = _normalized(value)
    return not normalized or any(
        normalized == old or (
            re.findall(r"\d+", normalized) == re.findall(r"\d+", old)
            and SequenceMatcher(None, normalized, old).ratio() >= 0.91
        )
        for old in seen
    )


def _valid_card(item: object) -> bool:
    return isinstance(item, dict) and all(
        isinstance(item.get(key), str) and item[key].strip()
        for key in ("front", "back")
    )


def _valid_question(item: object) -> bool:
    if not isinstance(item, dict) or not all(
        isinstance(item.get(key), str) and item[key].strip()
        for key in ("question", "explanation")
    ):
        return False
    options = item.get("options")
    return (
        isinstance(options, list)
        and len(options) == 4
        and all(isinstance(option, str) and option.strip() for option in options)
        and len({_normalized(option) for option in options}) == 4
        and type(item.get("answer_index")) is int
        and 0 <= item["answer_index"] < 4
    )


async def generate_unique_material(
    document: StudyDocument,
    generator: StudyMaterialGenerator,
    previous_flashcards: list[str] | None = None,
    previous_questions: list[str] | None = None,
) -> dict:
    previous_flashcards = list(previous_flashcards or [])
    previous_questions = list(previous_questions or [])
    seen_cards = [_normalized(value) for value in previous_flashcards]
    seen_questions = [_normalized(value) for value in previous_questions]
    cards: list[dict] = []
    questions: list[dict] = []
    summary = ""

    for attempt in range(MAX_GENERATION_ATTEMPTS):
        if len(cards) == FLASHCARD_COUNT and len(questions) == QUESTION_COUNT:
            break
        request = GenerationRequest(
            document=document,
            flashcard_count=FLASHCARD_COUNT - len(cards),
            question_count=QUESTION_COUNT - len(questions),
            previous_flashcards=tuple(previous_flashcards + [card["front"] for card in cards]),
            previous_questions=tuple(previous_questions + [question["question"] for question in questions]),
            attempt=attempt,
        )
        result = await generator.generate(request)
        if not isinstance(result, dict):
            continue
        if isinstance(result.get("summary"), str) and result["summary"].strip():
            summary = result["summary"].strip()
        for card in result.get("flashcards", []) if isinstance(result.get("flashcards"), list) else []:
            if len(cards) >= FLASHCARD_COUNT:
                break
            if _valid_card(card) and not _is_repeat(card["front"], seen_cards):
                cards.append(card)
                seen_cards.append(_normalized(card["front"]))
        for question in result.get("questions", []) if isinstance(result.get("questions"), list) else []:
            if len(questions) >= QUESTION_COUNT:
                break
            if _valid_question(question) and not _is_repeat(question["question"], seen_questions):
                questions.append(question)
                seen_questions.append(_normalized(question["question"]))

    if len(cards) < FLASHCARD_COUNT or len(questions) < QUESTION_COUNT:
        raise InsufficientMaterialError(
            f"Could not create {QUESTION_COUNT} new questions and {FLASHCARD_COUNT} new flashcards from this PDF. "
            "Try a longer document or another AI model. The previous study set was not changed."
        )
    random = SystemRandom()
    answer_positions = [index % 4 for index in range(len(questions))]
    random.shuffle(answer_positions)
    for question, position in zip(questions, answer_positions):
        correct = question["options"][question["answer_index"]]
        alternatives = [option for index, option in enumerate(question["options"]) if index != question["answer_index"]]
        random.shuffle(alternatives)
        alternatives.insert(position, correct)
        question["options"] = alternatives
        question["answer_index"] = position
    return {"summary": summary, "flashcards": cards, "questions": questions}
