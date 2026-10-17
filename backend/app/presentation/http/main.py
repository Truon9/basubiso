from contextlib import asynccontextmanager
import hashlib
import hmac
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from mistralai.models.sdkerror import SDKError
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import select, text

from app.application.errors import RateLimitExhaustedError
from app.application.generate_study_set import GenerateStudySet
from app.application.material_generation import InsufficientMaterialError, generate_unique_material
from app.domain.models import SourcePage, StudyDocument
from app.infrastructure.ai.failover_generator import FailoverGenerator
from app.infrastructure.ai.gemini_generator import GeminiGenerator
from app.infrastructure.ai.mistral_generator import MistralGenerator
from app.infrastructure.persistence.database import Base, Course, SessionLocal, StoredDocument, User, engine
from app.infrastructure.pdf.pymupdf_extractor import PyMuPdfExtractor

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

@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Additive upgrade for databases created before regeneration existed.
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_pages JSONB NOT NULL DEFAULT '[]'::jsonb"))
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS flashcard_history JSONB NOT NULL DEFAULT '[]'::jsonb"))
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS question_history JSONB NOT NULL DEFAULT '[]'::jsonb"))
    if settings.admin_password:
        with SessionLocal() as session:
            if not session.scalar(select(User).where(User.username == settings.admin_username)):
                session.add(User(username=settings.admin_username, password_hash=hash_password(settings.admin_password), is_admin=True))
                session.commit()
    yield

app = FastAPI(title="MayStudy API", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])

class CourseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

class LoginPayload(BaseModel):
    username: str
    password: str

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}:{digest.hex()}"

def verify_password(password: str, encoded: str) -> bool:
    salt, expected = encoded.split(":", 1)
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)

def document_payload(document: StoredDocument) -> dict:
    return {"id": document.id, "filename": document.filename, "summary": document.summary, "flashcards": document.flashcards, "questions": document.questions, "can_refresh": bool(document.source_pages), "created_at": document.created_at}

def generator() -> FailoverGenerator:
    providers = []
    if settings.mistral_api_key:
        providers.append(MistralGenerator(settings.mistral_api_key, settings.mistral_model))
    providers.extend(GeminiGenerator(key, settings.gemini_model) for key in (settings.gemini_api_key_1, settings.gemini_api_key_2, settings.gemini_api_key_3) if key)
    if not providers:
        raise HTTPException(503, "No AI API key is configured.")
    return FailoverGenerator(providers[0], providers[1:])

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

@app.post("/v1/auth/login")
def login(payload: LoginPayload) -> dict:
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.username == payload.username))
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(401, "Invalid username or password.")
        return {"id": user.id, "username": user.username, "is_admin": user.is_admin}

@app.get("/v1/courses")
def list_courses() -> list[dict]:
    with SessionLocal() as session:
        courses = session.scalars(select(Course).order_by(Course.created_at.desc())).all()
        return [{"id": course.id, "name": course.name, "created_at": course.created_at, "document_count": len(course.documents)} for course in courses]

@app.post("/v1/courses", status_code=201)
def create_course(payload: CourseCreate) -> dict:
    with SessionLocal() as session:
        course = Course(name=payload.name.strip())
        session.add(course)
        try:
            session.commit()
        except Exception as error:
            session.rollback()
            raise HTTPException(409, "A subject with this name already exists.") from error
        return {"id": course.id, "name": course.name, "created_at": course.created_at, "document_count": 0}

@app.get("/v1/courses/{course_id}")
def get_course(course_id: int) -> dict:
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if not course:
            raise HTTPException(404, "Subject not found.")
        return {"id": course.id, "name": course.name, "documents": [document_payload(item) for item in sorted(course.documents, key=lambda item: item.created_at, reverse=True)]}

@app.delete("/v1/courses/{course_id}/documents/{document_id}", status_code=204)
def delete_document(course_id: int, document_id: int) -> None:
    with SessionLocal() as session:
        document = session.get(StoredDocument, document_id)
        if document is None or document.course_id != course_id:
            raise HTTPException(404, "Document not found in this subject.")
        session.delete(document)
        session.commit()

@app.post("/v1/courses/{course_id}/documents:generate", status_code=201)
async def generate_document(course_id: int, file: UploadFile = File(...)) -> dict:
    if file.content_type != "application/pdf":
        raise HTTPException(415, "Only PDF files are supported.")
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"PDF exceeds {settings.max_upload_mb}MB.")
    with SessionLocal() as session:
        course = session.get(Course, course_id)
        if not course:
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
async def refresh_document(course_id: int, document_id: int) -> dict:
    with SessionLocal() as session:
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
