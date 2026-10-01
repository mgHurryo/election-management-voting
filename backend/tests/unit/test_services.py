from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

from app.core.errors import AppError
from app.core.security import TokenManager
from app.models.identity import UserIdentity
from app.services.identity import IdentityService


def test_service_revalidates_direct_calls(settings):
    factory = MagicMock()
    service = IdentityService(factory, TokenManager(settings))
    for username, password in [(" ", "Password123"), ("x" * 51, "Password123"), ("voter", "")]:
        with pytest.raises(AppError):
            service.login(username, password)
    factory.assert_not_called()


def test_role_rejection_does_not_depend_on_http():
    user = UserIdentity(1, "voter", "Voter", "USER", "ACTIVE", datetime.now(UTC), datetime.now(UTC))
    with pytest.raises(AppError) as error:
        IdentityService.require_role(user, "ADMIN")
    assert error.value.status_code == 403
