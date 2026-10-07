from dataclasses import asdict
from typing import Literal

from pydantic import BaseModel, field_validator

from app.models.roster import VoterMembership
from app.schemas.common import ID, RequestModel, Timestamp


class VoterCreate(RequestModel):
    user_id: ID
    vote_quota: Literal[1] = 1

    @field_validator("vote_quota", mode="before")
    @classmethod
    def vote_quota_must_be_integer_one(cls, value: object) -> object:
        # JSON booleans, floats or strings must not coerce into the quota.
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError("vote_quota must be the integer 1 in v1")
        return value


class VoterResponse(BaseModel):
    election_id: ID
    user_id: ID
    display_name: str
    vote_quota: int
    created_at: Timestamp
    updated_at: Timestamp

    @classmethod
    def from_membership(cls, membership: VoterMembership) -> "VoterResponse":
        data = asdict(membership)
        data["election_id"] = str(membership.election_id)
        data["user_id"] = str(membership.user_id)
        return cls.model_validate(data)
