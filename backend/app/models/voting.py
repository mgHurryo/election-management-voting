from dataclasses import dataclass

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
