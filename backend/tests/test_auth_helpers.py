import unittest

from app.application.auth import create_session_token, hash_password, hash_session_token, verify_password


class AuthHelpersTests(unittest.TestCase):
    def test_password_is_salted_and_verified(self):
        first = hash_password("long-password-123")
        second = hash_password("long-password-123")
        self.assertNotEqual(first, second)
        self.assertTrue(verify_password("long-password-123", first))
        self.assertFalse(verify_password("wrong", first))
        self.assertFalse(verify_password("long-password-123", "invalid"))

    def test_session_token_is_opaque_and_hashed(self):
        token, stored_hash, expiry = create_session_token()
        self.assertNotEqual(token, stored_hash)
        self.assertEqual(hash_session_token(token), stored_hash)
        self.assertGreater(expiry.timestamp(), 0)


if __name__ == "__main__":
    unittest.main()
