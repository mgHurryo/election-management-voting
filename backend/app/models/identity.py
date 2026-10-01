from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class UserIdentity:
    id: int
    username: str
    display_name: str
    role: str
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class UserAccount:
    identity: UserIdentity
    password_hash: str = field(repr=False)


@dataclass(frozen=True)
class LoginResult:
    access_token: str = field(repr=False)
    expires_in: int
    user: UserIdentity
