from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
import pytest

from app.application.errors import AppError
from app.infrastructure.security import (
    TokenManager,
    hash_password,
    validate_new_password,
    verify_password,
)


def test_bcrypt_policy_and_no_normalization():
    password = " Password123 "
    hashed = hash_password(password)
    assert hashed.startswith("$2b$12$")
    assert verify_password(password, hashed)
    assert not verify_password(password.strip(), hashed)
    assert not verify_password("x" * 73, hashed)
    assert not verify_password("Password123", "broken-hash")


@pytest.mark.parametrize("password", ["short1", "abcdefgh", "12345678", "é" * 36 + "1"])
def test_new_password_policy(password):
    with pytest.raises(ValueError):
        validate_new_password(password)


def test_72_byte_boundary():
    validate_new_password("a" * 71 + "1")
    password = "é" * 35 + "a1"
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()
    assert verify_password(password, hashed)
    assert not verify_password(password + "x", hashed)


def test_jwt_round_trip_has_no_password_or_vote_claims(settings):
    tokens = TokenManager(
        secret=settings.jwt_secret.get_secret_value(), expire_minutes=settings.jwt_expire_minutes
    )
    token = tokens.issue(18446744073709551615)
    assert tokens.subject(token) == 18446744073709551615
    claims = jwt.decode(token, settings.jwt_secret.get_secret_value(), algorithms=["HS256"])
    assert set(claims) == {"sub", "iat", "exp"}
    assert claims["exp"] - claims["iat"] == 3600


@pytest.mark.parametrize(
    "changes",
    [
        {"sub": "0"},
        {"sub": "01"},
        {"sub": "18446744073709551616"},
        {"sub": 21},
        {"sub": "x" * 5000},
        {"exp": 1},
        {"exp": None},
        {"iat": None},
    ],
)
def test_invalid_jwt_claims(settings, changes):
    now = datetime.now(UTC)
    claims = {"sub": "21", "iat": now, "exp": now + timedelta(minutes=60)} | changes
    token = jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm="HS256")
    with pytest.raises(AppError) as error:
        TokenManager(
            secret=settings.jwt_secret.get_secret_value(),
            expire_minutes=settings.jwt_expire_minutes,
        ).subject(token)
    assert error.value.code == "AUTHENTICATION_REQUIRED"


@pytest.mark.parametrize(
    "algorithm,key,claims",
    [
        (
            "HS256",
            "a-different-signing-key-that-is-long-enough",
            {"sub": "21", "iat": 1, "exp": 9999999999},
        ),
        ("HS384", None, {"sub": "21", "iat": 1, "exp": 9999999999}),
        ("HS256", None, {"sub": "21", "exp": 9999999999}),
    ],
)
def test_forged_algorithm_or_missing_claims(settings, algorithm, key, claims):
    token = jwt.encode(claims, key or settings.jwt_secret.get_secret_value(), algorithm=algorithm)
    with pytest.raises(AppError):
        TokenManager(
            secret=settings.jwt_secret.get_secret_value(),
            expire_minutes=settings.jwt_expire_minutes,
        ).subject(token)
