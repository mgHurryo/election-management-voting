from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

from app.application.errors import AppError
from app.application.services.identity import IdentityService
from app.domain.identity import UserIdentity
from app.infrastructure.security import TokenManager, verify_password


def test_service_revalidates_direct_calls(settings, password_hash):
    factory = MagicMock()
    service = IdentityService(
        factory,
        TokenManager(
            secret=settings.jwt_secret.get_secret_value(),
            expire_minutes=settings.jwt_expire_minutes,
        ),
        verify_password=verify_password,
        dummy_hash=password_hash,
    )
    for username, password in [(" ", "Password123"), ("x" * 51, "Password123"), ("voter", "")]:
        with pytest.raises(AppError):
            service.login(username, password)
    factory.assert_not_called()


def test_role_rejection_does_not_depend_on_http():
    user = UserIdentity(1, "voter", "Voter", "USER", "ACTIVE", datetime.now(UTC), datetime.now(UTC))
    with pytest.raises(AppError) as error:
        IdentityService.require_role(user, "ADMIN")
    assert error.value.code == "PERMISSION_DENIED"
