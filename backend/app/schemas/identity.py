from dataclasses import asdict
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StrictStr, field_validator

from app.models.identity import UserIdentity
from app.schemas.common import ID, RequestModel, Timestamp


class LoginRequest(RequestModel):
    username: Annotated[StrictStr, Field(min_length=1, max_length=50)]
    password: Annotated[StrictStr, Field(min_length=1, repr=False)]

    @field_validator("username", mode="before")
    @classmethod
    def trim_username(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class UserResponse(BaseModel):
    id: ID
    username: str
    display_name: str
    role: Literal["ADMIN", "USER"]
    status: Literal["ACTIVE", "DISABLED"]
    created_at: Timestamp
    updated_at: Timestamp

    @classmethod
    def from_identity(cls, user: UserIdentity) -> "UserResponse":
        data = asdict(user)
        data["id"] = str(user.id)
        return cls.model_validate(data)


class TokenResponse(BaseModel):
    access_token: str = Field(repr=False)
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(gt=0)
    user: UserResponse
