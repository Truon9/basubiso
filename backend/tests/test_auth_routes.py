import unittest
from types import SimpleNamespace
from unittest.mock import patch

try:
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials
    from app.presentation.http import auth
except ModuleNotFoundError:
    auth = None


class FakeSession:
    def __init__(self, user=None, stored=None):
        self.user = user
        self.stored = stored
        self.added = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def scalar(self, *_):
        return self.user

    def get(self, model, _key):
        return self.stored if model is auth.UserSession else self.user

    def add(self, item):
        self.added.append(item)
        if isinstance(item, auth.User):
            item.id = 7

    def commit(self):
        pass


@unittest.skipIf(auth is None, "Backend dependencies are not installed in this interpreter")
class AuthRoutesTests(unittest.TestCase):
    def test_register_hashes_password_and_cannot_create_admin(self):
        session = FakeSession()
        with patch.object(auth, "SessionLocal", return_value=session):
            result = auth.register(auth.Credentials(username="student", password="safe-password"))
        self.assertEqual(result["username"], "student")
        self.assertFalse(result["is_admin"])
        self.assertNotEqual(session.added[0].password_hash, "safe-password")
        self.assertTrue(auth.verify_password("safe-password", session.added[0].password_hash))
        with self.assertRaises(HTTPException) as error:
            auth.register(auth.Credentials(username="admin", password="safe-password"))
        self.assertEqual(error.exception.status_code, 409)

    def test_login_requires_correct_stored_password(self):
        user = SimpleNamespace(id=7, username="student", is_admin=False, password_hash=auth.hash_password("safe-password"))
        session = FakeSession(user=user)
        with patch.object(auth, "SessionLocal", return_value=session):
            with self.assertRaises(HTTPException) as error:
                auth.login(auth.Credentials(username="student", password="wrong"))
            result = auth.login(auth.Credentials(username="student", password="safe-password"))
        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(result["user"]["id"], 7)
        self.assertEqual(len(session.added), 1)
        self.assertEqual(auth.hash_session_token(result["access_token"]), session.added[0].token_hash)

    def test_session_must_exist_and_not_be_expired(self):
        user = SimpleNamespace(id=7, username="student", is_admin=False)
        token = HTTPAuthorizationCredentials(scheme="Bearer", credentials="secret")
        with patch.object(auth, "SessionLocal", return_value=FakeSession(user=user)):
            with self.assertRaises(HTTPException) as error:
                auth.current_user(token)
        self.assertEqual(error.exception.status_code, 401)
