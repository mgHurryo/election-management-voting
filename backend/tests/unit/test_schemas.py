from datetime import UTC, datetime

import pytest
from pydantic import TypeAdapter, ValidationError

from app.schemas.common import ID, Timestamp
from app.schemas.identity import LoginRequest


@pytest.mark.parametrize("value", ["0", "01", "-1", "18446744073709551616", 1, True, "1.5"])
def test_invalid_ids(value):
    with pytest.raises(ValidationError):
        TypeAdapter(ID).validate_python(value)


def test_id_round_trip_above_javascript_safe_integer():
    assert TypeAdapter(ID).validate_python("18446744073709551615") == "18446744073709551615"


def test_timestamp_normalizes_to_utc():
    adapter = TypeAdapter(Timestamp)
    value = adapter.validate_python("2026-10-02T10:00:00+08:00")
    assert value == datetime(2026, 10, 2, 2, tzinfo=UTC)
    assert adapter.dump_json(value) == b'"2026-10-02T02:00:00Z"'


@pytest.mark.parametrize(
    "value",
    [
        "2026-10-02T10:00:00",
        "2026-10-02T10:00:00.123Z",
        1720000000,
        datetime(2026, 10, 2),
        datetime(2026, 10, 2, microsecond=1, tzinfo=UTC),
    ],
)
def test_invalid_timestamps(value):
    with pytest.raises(ValidationError):
        TypeAdapter(Timestamp).validate_python(value)


def test_login_preserves_password_and_trims_username():
    request = LoginRequest(username=" voter ", password=" Password123 ")
    assert request.username == "voter"
    assert request.password == " Password123 "
    assert "Password123" not in repr(request)
