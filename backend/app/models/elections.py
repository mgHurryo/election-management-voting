from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ElectionDetails:
    id: int
    title: str
    position_title: str
    description: str | None
    created_by: int
    status: str
    privacy_mode: str
    starts_at: datetime
    ends_at: datetime
    results_published_at: datetime | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class CandidateDetails:
    id: int
    election_id: int
    name: str
    position_title: str
    description: str
    photo_url: str | None
    display_order: int
    created_at: datetime
    updated_at: datetime
