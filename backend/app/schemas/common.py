import re
from datetime import UTC, datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    StrictStr,
)

MAX_ID = 18446744073709551615


def validate_id(value: str) -> str:
    if len(value) > 20 or int(value) > MAX_ID:
        raise ValueError("ID exceeds BIGINT UNSIGNED")
    return value


ID = Annotated[
    StrictStr,
    Field(pattern=r"^[1-9][0-9]*$", max_length=20),
    AfterValidator(validate_id),
]


def timestamp_input(value: object) -> object:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})",
        value,
    ):
        raise ValueError("expected an RFC3339 timestamp with timezone and whole seconds")
    return value


def normalize_timestamp(value: datetime) -> datetime:
    if value.microsecond:
        raise ValueError("timestamp must have whole-second precision")
    return value.astimezone(UTC)


Timestamp = Annotated[
    AwareDatetime,
    BeforeValidator(timestamp_input),
    AfterValidator(normalize_timestamp),
    PlainSerializer(lambda value: value.isoformat().replace("+00:00", "Z"), return_type=str),
]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DataResponse[T](BaseModel):
    data: T


class PaginationMeta(BaseModel):
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class PaginatedResponse[T](BaseModel):
    data: list[T]
    meta: PaginationMeta


class ErrorDetail(BaseModel):
    field: str
    reason: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
