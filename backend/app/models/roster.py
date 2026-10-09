from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ElectionSnapshot:
    """The election fields the roster workflows are allowed to see."""

    id: int
    status: str


@dataclass(frozen=True)
class VoterMembership:
    election_id: int
    user_id: int
    display_name: str
    vote_quota: int
    created_at: datetime
    updated_at: datetime
