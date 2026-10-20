from dataclasses import asdict
from typing import Annotated

from pydantic import BaseModel, Field, StrictBool

from app.models.voting import (
    BallotView,
    ParticipationStatus,
    ResultDetails,
    VoteAccepted,
)
from app.schemas.common import ID, RequestModel, Timestamp
from app.schemas.elections import CandidateName, CandidateResponse, ElectionResponse


class VoteCreateRequest(RequestModel):
    candidate_id: ID


class VoteAcceptedResponse(BaseModel):
    election_id: ID
    accepted: StrictBool

    @classmethod
    def from_accepted(cls, accepted: VoteAccepted) -> "VoteAcceptedResponse":
        return cls(election_id=str(accepted.election_id), accepted=accepted.accepted)


class ParticipationResponse(BaseModel):
    election_id: ID
    eligible: StrictBool
    vote_quota: Annotated[int, Field(ge=0)]
    used_votes: Annotated[int, Field(ge=0)]
    remaining_votes: Annotated[int, Field(ge=0)]

    @classmethod
    def from_status(cls, status: ParticipationStatus) -> "ParticipationResponse":
        values = asdict(status)
        values["election_id"] = str(values["election_id"])
        return cls.model_validate(values)


class BallotViewResponse(BaseModel):
    election: ElectionResponse
    candidates: list[CandidateResponse]
    participation: ParticipationResponse

    @classmethod
    def from_view(cls, view: BallotView) -> "BallotViewResponse":
        return cls(
            election=ElectionResponse.from_election(view.election),
            candidates=[CandidateResponse.from_candidate(row) for row in view.candidates],
            participation=ParticipationResponse.from_status(view.participation),
        )


class CandidateTallyResponse(BaseModel):
    candidate_id: ID
    name: CandidateName
    vote_count: Annotated[int, Field(ge=0)]


class ResultResponse(BaseModel):
    election_id: ID
    position_title: Annotated[str, Field(min_length=1, max_length=100)]
    results_published_at: Timestamp | None
    total_votes: Annotated[int, Field(ge=0)]
    candidates: list[CandidateTallyResponse]
    winner_candidate_id: ID | None

    @classmethod
    def from_result(cls, result: ResultDetails) -> "ResultResponse":
        return cls(
            election_id=str(result.election_id),
            position_title=result.position_title,
            results_published_at=result.results_published_at,
            total_votes=result.total_votes,
            candidates=[
                CandidateTallyResponse(
                    candidate_id=str(row.candidate_id),
                    name=row.name,
                    vote_count=row.vote_count,
                )
                for row in result.candidates
            ],
            winner_candidate_id=(
                str(result.winner_candidate_id)
                if result.winner_candidate_id is not None
                else None
            ),
        )
