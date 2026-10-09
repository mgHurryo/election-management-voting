import re
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.application.errors import authentication_required

ALGORITHM = "HS256"
MAX_ID = 18446744073709551615


def validate_new_password(password: str) -> None:
    """ADR-009 policy for authorized account provisioning, not a login policy."""
    if (
        len(password) < 8
        or len(password.encode("utf-8")) > 72
        or not any(c.isalpha() for c in password)
        or not any(c.isdigit() for c in password)
    ):
        raise ValueError(
            "password needs 8+ characters, a letter, a digit and at most 72 UTF-8 bytes"
        )


def hash_password(password: str) -> str:
    validate_new_password(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    # Never truncate or normalize passwords, including multibyte inputs.
    if len(password.encode("utf-8")) > 72:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, UnicodeError):
        return False


class TokenManager:
    def __init__(self, *, secret: str, expire_minutes: int) -> None:
        self._secret = secret
        self.expires_in = expire_minutes * 60

    def issue(self, user_id: int) -> str:
        now = datetime.now(UTC).replace(microsecond=0)
        return jwt.encode(
            {"sub": str(user_id), "iat": now, "exp": now + timedelta(seconds=self.expires_in)},
            self._secret,
            algorithm=ALGORITHM,
        )

    def subject(self, token: str) -> int:
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[ALGORITHM],
                options={"require": ["sub", "iat", "exp"]},
            )
            subject = claims["sub"]
            if (
                not isinstance(subject, str)
                or len(subject) > 20
                or not re.fullmatch(r"[1-9][0-9]*", subject)
                or int(subject) > MAX_ID
            ):
                raise ValueError("invalid subject")
            return int(subject)
        except (jwt.InvalidTokenError, ValueError, TypeError, OverflowError) as exc:
            raise authentication_required() from exc
