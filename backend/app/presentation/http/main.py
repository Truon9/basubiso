from contextlib import asynccontextmanager
import json
import logging
from typing import Literal

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from mistralai.models.sdkerror import SDKError
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.application.errors import RateLimitExhaustedError
from app.application.auth import hash_password
from app.application.generate_study_set import GenerateStudySet
from app.application.material_generation import InsufficientMaterialError, generate_unique_material
from app.application.study_chat import StudyChat, build_course_context
from app.domain.models import SourcePage, StudyDocument
from app.infrastructure.ai.failover_generator import FailoverGenerator, _is_rate_limited
from app.infrastructure.ai.chat_providers import FailoverChatProvider, GeminiChatProvider, MistralChatProvider
from app.infrastructure.ai.gemini_generator import GeminiGenerator
from app.infrastructure.ai.mistral_generator import MistralGenerator
from app.infrastructure.persistence.database import Base, Course, SessionLocal, StoredDocument, User, engine
from app.infrastructure.pdf.pymupdf_extractor import PyMuPdfExtractor
from app.presentation.http.auth import AuthUser, current_user, router as auth_router

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    mistral_api_key: str = ""
    mistral_model: str = "mistral-small-latest"
    gemini_api_key_1: str = ""
    gemini_api_key_2: str = ""
    gemini_api_key_3: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"
    max_upload_mb: int = 15
    admin_username: str = "admin"
    admin_password: str = ""

settings = Settings()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Additive upgrade for databases created before regeneration existed.
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_pages JSONB NOT NULL DEFAULT '[]'::jsonb"))
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS flashcard_history JSONB NOT NULL DEFAULT '[]'::jsonb"))
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS question_history JSONB NOT NULL DEFAULT '[]'::jsonb"))
        connection.execute(text("ALTER TABLE courses ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
        connection.execute(text("ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_name_key"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_owner_name ON courses (owner_id, name)"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username_lower ON users (lower(username))"))
    with SessionLocal() as session:
        if settings.admin_password:
            if not session.scalar(select(User).where(User.username == settings.admin_username)):
                session.add(User(username=settings.admin_username, password_hash=hash_password(settings.admin_password), is_admin=True))
                session.commit()
        admin = session.scalar(select(User).where(User.username == settings.admin_username, User.is_admin.is_(True)))
        if admin is not None:
            session.execute(text("UPDATE courses SET owner_id = :owner_id WHERE owner_id IS NULL"), {"owner_id": admin.id})
            session.commit()
    yield

app = FastAPI(title="MayStudy API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://2qvm9rmc-5173.asse.devtunnels.ms"], allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router)

class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=10)
    course_id: int | None = Field(default=None, gt=0)
    language: Literal["en", "vi"] = "en"

def document_payload(document: StoredDocument) -> dict:
    return {"id": document.id, "filename": document.filename, "summary": document.summary, "flashcards": document.flashcards, "questions": document.questions, "can_refresh": bool(document.source_pages), "created_at": document.created_at}

def course_payload(course: Course) -> dict:
    return {"id": course.id, "name": course.name, "created_at": course.created_at, "document_count": len(course.documents)}

def generator() -> FailoverGenerator:
    providers = []
    if settings.mistral_api_key:
        providers.append(MistralGenerator(settings.mistral_api_key, settings.mistral_model))
    providers.extend(GeminiGenerator(key, settings.gemini_model) for key in (settings.gemini_api_key_1, settings.gemini_api_key_2, settings.gemini_api_key_3) if key)
    if not providers:
        raise HTTPException(503, "No AI API key is configured.")
    return FailoverGenerator(providers[0], providers[1:])


def chat_provider() -> FailoverChatProvider:
    providers = []
    if settings.mistral_api_key:
        providers.append(MistralChatProvider(settings.mistral_api_key, settings.mistral_model))
    providers.extend(GeminiChatProvider(key, settings.gemini_model) for key in (settings.gemini_api_key_1, settings.gemini_api_key_2, settings.gemini_api_key_3) if key)
    if not providers:
        raise HTTPException(503, "No AI API key is configured.")
    return FailoverChatProvider(providers)

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

def chat_context(course_id: int | None, user_id: int) -> tuple[str | None, str | None]:
    course_name = None
    context = None
    if course_id is not None:
        with SessionLocal() as session:
            course = session.get(Course, course_id)
            if course is None or course.owner_id != user_id:
                raise HTTPException(404, "Subject not found.")
            course_name = course.name
            documents = sorted(course.documents, key=lambda item: item.created_at, reverse=True)
            context = build_course_context(documents)
    return course_name, context


def chat_message(payload: ChatRequest) -> str:
    message = payload.message.strip()
    if not message:
        raise HTTPException(422, "Message cannot be empty.")
    return message


@app.post("/v1/chat")
async def chat(payload: ChatRequest, user: AuthUser = Depends(current_user)) -> dict:
    message = chat_message(payload)
    course_name, context = chat_context(payload.course_id, user.id)
    try:
        reply = await StudyChat(chat_provider()).reply(
            message,
            [item.model_dump() for item in payload.history],
            payload.language,
            course_name,
            context,
        )
    except RateLimitExhaustedError as error:
        raise HTTPException(429, str(error)) from error
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Study chat provider failed")
        raise HTTPException(502, "AI assistant is temporarily unavailable.") from error
    return {"reply": reply}


def chat_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/v1/chat:stream")
async def stream_chat(payload: ChatRequest, user: AuthUser = Depends(current_user)) -> StreamingResponse:
    message = chat_message(payload)
    course_name, context = chat_context(payload.course_id, user.id)
    try:
        chunks = StudyChat(chat_provider()).stream(
            message,
            [item.model_dump() for item in payload.history],
            payload.language,
            course_name,
            context,
        )
        first_chunk = await anext(chunks)
    except RateLimitExhaustedError as error:
        raise HTTPException(429, str(error)) from error
    except StopAsyncIteration as error:
        raise HTTPException(502, "AI assistant returned an empty reply.") from error
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Study chat stream could not start")
        raise HTTPException(502, "AI assistant is temporarily unavailable.") from error

    async def events():
        try:
            yield chat_event("delta", {"text": first_chunk})
            async for chunk in chunks:
                yield chat_event("delta", {"text": chunk})
            yield chat_event("done", {})
        except Exception as error:
            logger.exception("Study chat stream interrupted")
            code = "rate_limited" if _is_rate_limited(error) else "provider_error"
            yield chat_event("error", {"code": code, "message": "AI assistant could not finish the reply."})
        finally:
            await chunks.aclose()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )

@app.get("/v1/courses")
def list_courses(user: AuthUser = Depends(current_user)) -> list[dict]:
    with SessionLocal() as session:
        courses = session.scalars(select(Course).where(Course.owner_id == user.id).order_by(Course.created_at.desc())).all()
        return [course_payload(course) for course in courses]

@app.post("/v1/courses", status_code=201)
def create_course(payload: CourseCreate, user: AuthUser = Depends(current_user)) -> dict:
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Subject name cannot be empty.")
    with SessionLocal() as session:
        course = Course(name=name, owner_id=user.id)
        session.add(course)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, "A subject with this name already exists.") from error
        return course_payload(course)

@app.get("/v1/courses/{course_id}")
def get_course(course_id: int, user: AuthUser = Depends(current_user)) -> dict:
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if not course or course.owner_id != user.id:
            raise HTTPException(404, "Subject not found.")
        return {"id": course.id, "name": course.name, "documents": [document_payload(item) for item in sorted(course.documents, key=lambda item: item.created_at, reverse=True)]}

@app.patch("/v1/courses/{course_id}")
def rename_course(course_id: int, payload: CourseCreate, user: AuthUser = Depends(current_user)) -> dict:
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Subject name cannot be empty.")
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if course is None or course.owner_id != user.id:
            raise HTTPException(404, "Subject not found.")
        if course.name != name:
            course.name = name
            try:
                session.commit()
            except IntegrityError as error:
                session.rollback()
                raise HTTPException(409, "A subject with this name already exists.") from error
        return course_payload(course)

@app.delete("/v1/courses/{course_id}", status_code=204)
def delete_course(course_id: int, user: AuthUser = Depends(current_user)) -> None:
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if course is None or course.owner_id != user.id:
            raise HTTPException(404, "Subject not found.")
        session.delete(course)
        session.commit()

@app.delete("/v1/courses/{course_id}/documents/{document_id}", status_code=204)
def delete_document(course_id: int, document_id: int, user: AuthUser = Depends(current_user)) -> None:
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if course is None or course.owner_id != user.id:
            raise HTTPException(404, "Subject not found.")
        document = session.get(StoredDocument, document_id)
        if document is None or document.course_id != course_id:
            raise HTTPException(404, "Document not found in this subject.")
        session.delete(document)
        session.commit()

@app.post("/v1/courses/{course_id}/documents:generate", status_code=201)
async def generate_document(course_id: int, file: UploadFile = File(...), user: AuthUser = Depends(current_user)) -> dict:
    if file.content_type != "application/pdf":
        raise HTTPException(415, "Only PDF files are supported.")
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if not course or course.owner_id != user.id:
            raise HTTPException(404, "Subject not found.")
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"PDF exceeds {settings.max_upload_mb}MB.")
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if not course or course.owner_id != user.id:
            raise HTTPException(404, "Subject not found.")
        try:
            material = await GenerateStudySet(PyMuPdfExtractor(), generator()).execute(file.filename or "document.pdf", content)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        except InsufficientMaterialError as error:
            raise HTTPException(422, str(error)) from error
        except RateLimitExhaustedError as error:
            raise HTTPException(429, str(error)) from error
        except SDKError as error:
            raise HTTPException(502, "AI provider could not generate study material.") from error
        document = StoredDocument(
            course_id=course.id,
            filename=file.filename or "document.pdf",
            summary=material["summary"],
            flashcards=material["flashcards"],
            questions=material["questions"],
            source_pages=material["source_pages"],
            flashcard_history=[card["front"] for card in material["flashcards"]],
            question_history=[question["question"] for question in material["questions"]],
        )
        session.add(document)
        session.commit()
        return document_payload(document)


@app.post("/v1/courses/{course_id}/documents/{document_id}:refresh")
async def refresh_document(course_id: int, document_id: int, user: AuthUser = Depends(current_user)) -> dict:
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if course is None or course.owner_id != user.id:
            raise HTTPException(404, "Subject not found.")
        document = session.scalar(
            select(StoredDocument)
            .where(StoredDocument.id == document_id, StoredDocument.course_id == course_id)
            .with_for_update()
        )
        if document is None:
            raise HTTPException(404, "Document not found in this subject.")
        if not document.source_pages:
            raise HTTPException(409, "This document was uploaded before source text was saved. Upload the PDF again to enable refresh.")
        source = StudyDocument(
            filename=document.filename,
            pages=[SourcePage(number=page["number"], text=page["text"]) for page in document.source_pages],
        )
        old_cards = list(document.flashcard_history or []) or [card["front"] for card in document.flashcards]
        old_questions = list(document.question_history or []) or [question["question"] for question in document.questions]
        try:
            material = await generate_unique_material(source, generator(), old_cards, old_questions)
        except InsufficientMaterialError as error:
            raise HTTPException(409, str(error)) from error
        except RateLimitExhaustedError as error:
            raise HTTPException(429, str(error)) from error
        except SDKError as error:
            raise HTTPException(502, "AI provider could not generate study material.") from error
        document.summary = material["summary"]
        document.flashcards = material["flashcards"]
        document.questions = material["questions"]
        document.flashcard_history = old_cards + [card["front"] for card in material["flashcards"]]
        document.question_history = old_questions + [question["question"] for question in material["questions"]]
        session.commit()
        return document_payload(document)
