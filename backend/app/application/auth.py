import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta


SESSION_LIFETIME = timedelta(days=30)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt, expected = encoded.split(":", 1)
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (TypeError, ValueError):
        return False


def create_session_token() -> tuple[str, str, datetime]:
    token = secrets.token_urlsafe(32)
    return token, hash_session_token(token), datetime.utcnow() + SESSION_LIFETIME


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
