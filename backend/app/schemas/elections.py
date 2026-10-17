from dataclasses import asdict
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    Field,
    StrictInt,
    StrictStr,
    field_validator,
    model_validator,
)

from app.models.elections import CandidateDetails, ElectionDetails
from app.schemas.common import ID, RequestModel, Timestamp

ElectionTitle = Annotated[StrictStr, Field(min_length=1, max_length=200)]
PositionTitle = Annotated[StrictStr, Field(min_length=1, max_length=100)]
ElectionDescription = Annotated[StrictStr, Field(max_length=10000)]
CandidateName = Annotated[StrictStr, Field(min_length=1, max_length=100)]
CandidateDescription = Annotated[StrictStr, Field(min_length=1, max_length=10000)]
PhotoUrl = Annotated[StrictStr, Field(max_length=500)]
DisplayOrder = Annotated[StrictInt, Field(ge=0, le=2147483647)]


def _nonblank(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
    return value


def _https_url(value: object) -> object:
    if value is None or not isinstance(value, str):
        return value
    parsed = urlsplit(value)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise ValueError("photo_url must be an absolute HTTPS URL.")
    return value


class ElectionCreateRequest(RequestModel):
    title: ElectionTitle
    position_title: PositionTitle
    description: ElectionDescription | None = None
    starts_at: Timestamp
    ends_at: Timestamp
    privacy_mode: Literal["FORCED_ANONYMOUS", "OPTIONAL_ANONYMOUS", "IDENTIFIED"] = (
        "FORCED_ANONYMOUS"
    )
    voter_ids: list[ID] = Field(min_length=1)

    @field_validator("title", "position_title", mode="before")
    @classmethod
    def require_nonblank_titles(cls, value: object) -> object:
        return _nonblank(value)

    @field_validator("voter_ids")
    @classmethod
    def require_unique_voters(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("voter_ids must not contain duplicates.")
        return value


class ElectionPatchRequest(RequestModel):
    title: ElectionTitle | None = None
    position_title: PositionTitle | None = None
    description: ElectionDescription | None = None
    starts_at: Timestamp | None = None
    ends_at: Timestamp | None = None
    privacy_mode: Literal["FORCED_ANONYMOUS", "OPTIONAL_ANONYMOUS", "IDENTIFIED"] | None = None

    @field_validator("title", "position_title", mode="before")
    @classmethod
    def require_nonblank_titles(cls, value: object) -> object:
        return _nonblank(value)

    @model_validator(mode="after")
    def require_patch_fields(self) -> "ElectionPatchRequest":
        if not self.model_fields_set:
            raise ValueError("At least one election field is required.")
        if "starts_at" in self.model_fields_set and self.starts_at is None:
            raise ValueError("starts_at cannot be null.")
        if "ends_at" in self.model_fields_set and self.ends_at is None:
            raise ValueError("ends_at cannot be null.")
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("title cannot be null.")
        if "position_title" in self.model_fields_set and self.position_title is None:
            raise ValueError("position_title cannot be null.")
        if "privacy_mode" in self.model_fields_set and self.privacy_mode is None:
            raise ValueError("privacy_mode cannot be null.")
        return self


class CandidateCreateRequest(RequestModel):
    name: CandidateName
    description: CandidateDescription
    photo_url: PhotoUrl | None = None
    display_order: DisplayOrder = 0

    @field_validator("name", "description", mode="before")
    @classmethod
    def require_nonblank_text(cls, value: object) -> object:
        return _nonblank(value)

    @field_validator("photo_url")
    @classmethod
    def require_https_photo(cls, value: str | None) -> str | None:
        return _https_url(value)


class CandidatePatchRequest(RequestModel):
    name: CandidateName | None = None
    description: CandidateDescription | None = None
    photo_url: PhotoUrl | None = None
    display_order: DisplayOrder | None = None

    @field_validator("name", "description", mode="before")
    @classmethod
    def require_nonblank_text(cls, value: object) -> object:
        return _nonblank(value)

    @field_validator("photo_url")
    @classmethod
    def require_https_photo(cls, value: str | None) -> str | None:
        return _https_url(value)

    @model_validator(mode="after")
    def require_patch_fields(self) -> "CandidatePatchRequest":
        if not self.model_fields_set:
            raise ValueError("At least one candidate field is required.")
        for field_name in ("name", "description", "display_order"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null.")
        return self


class ElectionResponse(BaseModel):
    id: ID
    title: ElectionTitle
    position_title: PositionTitle
    description: ElectionDescription | None
    created_by: ID
    status: Literal["DRAFT", "OPEN", "CLOSED"]
    privacy_mode: Literal["FORCED_ANONYMOUS", "OPTIONAL_ANONYMOUS", "IDENTIFIED"]
    starts_at: Timestamp
    ends_at: Timestamp
    results_published_at: Timestamp | None
    created_at: Timestamp
    updated_at: Timestamp

    @classmethod
    def from_election(cls, election: ElectionDetails) -> "ElectionResponse":
        values = asdict(election)
        for field_name in ("id", "created_by"):
            values[field_name] = str(values[field_name])
        return cls.model_validate(values)


class CandidateResponse(BaseModel):
    id: ID
    election_id: ID
    name: CandidateName
    position_title: PositionTitle
    description: CandidateDescription
    photo_url: PhotoUrl | None
    display_order: DisplayOrder
    created_at: Timestamp
    updated_at: Timestamp

    @classmethod
    def from_candidate(cls, candidate: CandidateDetails) -> "CandidateResponse":
        values = asdict(candidate)
        for field_name in ("id", "election_id"):
            values[field_name] = str(values[field_name])
        return cls.model_validate(values)
