import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

try:
    from fastapi import HTTPException
    from sqlalchemy.exc import IntegrityError
    from app.presentation.http import main
except ModuleNotFoundError:
    main = None


class FakeSession:
    def __init__(self, course=None, duplicate=False):
        self.course = course
        self.duplicate = duplicate
        self.commits = 0
        self.rollbacks = 0
        self.deleted = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def get(self, _model, _id):
        return self.course

    def commit(self):
        if self.duplicate:
            raise IntegrityError("UPDATE courses", {}, Exception("duplicate"))
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def delete(self, course):
        self.deleted = course


@unittest.skipIf(main is None, "Backend dependencies are not installed in this interpreter")
class CourseManagementTests(unittest.TestCase):
    def setUp(self):
        self.user = SimpleNamespace(id=1)
        self.course = SimpleNamespace(id=7, owner_id=1, name="Old name", created_at=datetime(2026, 1, 1), documents=[object(), object()])

    def test_rename_trims_name_and_preserves_documents(self):
        session = FakeSession(self.course)
        with patch.object(main, "SessionLocal", return_value=session):
            result = main.rename_course(7, main.CourseCreate(name="  New name  "), self.user)
        self.assertEqual(result["name"], "New name")
        self.assertEqual(result["document_count"], 2)
        self.assertEqual(session.commits, 1)
        self.assertEqual(len(self.course.documents), 2)

    def test_rename_duplicate_returns_conflict_and_rolls_back(self):
        session = FakeSession(self.course, duplicate=True)
        with patch.object(main, "SessionLocal", return_value=session):
            with self.assertRaises(HTTPException) as caught:
                main.rename_course(7, main.CourseCreate(name="Taken"), self.user)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(session.rollbacks, 1)

    def test_rename_rejects_whitespace_only(self):
        with self.assertRaises(HTTPException) as caught:
            main.rename_course(7, main.CourseCreate(name="   "), self.user)
        self.assertEqual(caught.exception.status_code, 422)

    def test_delete_course_uses_orm_delete_and_commits(self):
        session = FakeSession(self.course)
        with patch.object(main, "SessionLocal", return_value=session):
            main.delete_course(7, self.user)
        self.assertIs(session.deleted, self.course)
        self.assertEqual(session.commits, 1)
        self.assertTrue(main.Course.documents.property.cascade.delete_orphan)

    def test_missing_course_returns_404(self):
        session = FakeSession()
        with patch.object(main, "SessionLocal", return_value=session):
            with self.assertRaises(HTTPException) as rename_error:
                main.rename_course(7, main.CourseCreate(name="New"), self.user)
            with self.assertRaises(HTTPException) as delete_error:
                main.delete_course(7, self.user)
        self.assertEqual(rename_error.exception.status_code, 404)
        self.assertEqual(delete_error.exception.status_code, 404)

    def test_routes_are_exposed_with_expected_methods(self):
        course_path = main.app.openapi()["paths"]["/v1/courses/{course_id}"]
        self.assertIn("patch", course_path)
        self.assertIn("delete", course_path)

    def test_other_users_cannot_rename_or_delete_course(self):
        session = FakeSession(self.course)
        other = SimpleNamespace(id=2)
        with patch.object(main, "SessionLocal", return_value=session):
            with self.assertRaises(HTTPException) as rename_error:
                main.rename_course(7, main.CourseCreate(name="Stolen"), other)
            with self.assertRaises(HTTPException) as delete_error:
                main.delete_course(7, other)
        self.assertEqual(rename_error.exception.status_code, 404)
        self.assertEqual(delete_error.exception.status_code, 404)
        self.assertEqual(session.commits, 0)


if __name__ == "__main__":
    unittest.main()
