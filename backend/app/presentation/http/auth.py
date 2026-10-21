import re
import os
from dataclasses import dataclass
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.application.auth import create_session_token, hash_password, hash_session_token, verify_password
from app.infrastructure.persistence.database import SessionLocal, User, UserSession


router = APIRouter(prefix="/v1/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    id: int
    username: str
    is_admin: bool


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


def public_user(user: User) -> dict:
    return {"id": user.id, "username": user.username, "is_admin": user.is_admin}


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> AuthUser:
    if credentials is None:
        raise HTTPException(401, "Sign in required.", headers={"WWW-Authenticate": "Bearer"})
    with SessionLocal() as session:
        stored = session.get(UserSession, hash_session_token(credentials.credentials))
        if stored is None or stored.expires_at <= datetime.utcnow():
            raise HTTPException(401, "Session expired. Sign in again.", headers={"WWW-Authenticate": "Bearer"})
        user = session.get(User, stored.user_id)
        if user is None:
            raise HTTPException(401, "Session expired. Sign in again.", headers={"WWW-Authenticate": "Bearer"})
        return AuthUser(user.id, user.username, user.is_admin)


@router.post("/register", status_code=201)
def register(payload: Credentials) -> dict:
    username = payload.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,80}", username):
        raise HTTPException(422, "Username must be 3–80 characters: letters, numbers, _, . or -.")
    if username.lower() == os.getenv("ADMIN_USERNAME", "admin").lower():
        raise HTTPException(409, "Username is reserved.")
    if len(payload.password) < 8:
        raise HTTPException(422, "Password must contain at least 8 characters.")
    with SessionLocal() as session:
        if session.scalar(select(User.id).where(func.lower(User.username) == username.lower())) is not None:
            raise HTTPException(409, "Username is already taken.")
        user = User(username=username, password_hash=hash_password(payload.password), is_admin=False)
        session.add(user)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(409, "Username is already taken.") from error
        return public_user(user)


@router.post("/login")
def login(payload: Credentials) -> dict:
    with SessionLocal() as session:
        user = session.scalar(select(User).where(func.lower(User.username) == payload.username.strip().lower()))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(401, "Invalid username or password.")
        token, token_hash, expires_at = create_session_token()
        session.add(UserSession(token_hash=token_hash, user_id=user.id, expires_at=expires_at))
        session.commit()
        return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


@router.get("/me")
def me(user: AuthUser = Depends(current_user)) -> dict:
    return {"id": user.id, "username": user.username, "is_admin": user.is_admin}


@router.post("/logout", status_code=204)
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), _user: AuthUser = Depends(current_user)) -> None:
    with SessionLocal() as session:
        stored = session.get(UserSession, hash_session_token(credentials.credentials))
        if stored is not None:
            session.delete(stored)
            session.commit()
