from dataclasses import asdict
from typing import Annotated

from pydantic import BaseModel, Field, StrictBool

from app.models.voting import BallotView, ParticipationStatus
from app.schemas.common import ID, RequestModel
from app.schemas.elections import CandidateResponse, ElectionResponse


class VoteCreateRequest(RequestModel):
    candidate_id: ID


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
