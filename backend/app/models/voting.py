from dataclasses import dataclass
from datetime import datetime

from app.models.elections import CandidateDetails, ElectionDetails


@dataclass(frozen=True)
class ParticipationStatus:
    """The caller's own eligibility and quota usage; never another voter's."""

    election_id: int
    eligible: bool
    vote_quota: int
    used_votes: int
    remaining_votes: int


@dataclass(frozen=True)
class BallotView:
    """Everything one eligible voter needs to render the voting page."""

    election: ElectionDetails
    candidates: list[CandidateDetails]
    participation: ParticipationStatus


@dataclass(frozen=True)
class VoteAccepted:
    """Deliberately minimal: acceptance never identifies the stored ballot."""

    election_id: int
    accepted: bool


@dataclass(frozen=True)
class CandidateTally:
    """One candidate's aggregated vote count from ballot_choices (FR-12)."""

    candidate_id: int
    name: str
    vote_count: int


@dataclass(frozen=True)
class ResultDetails:
    """Recomputed tally; never a stored snapshot, results stay publish-free."""

    election_id: int
    position_title: str
    results_published_at: datetime | None
    total_votes: int
    candidates: list[CandidateTally]
    winner_candidate_id: int | None
