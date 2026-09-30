from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.mysql import BIGINT, INTEGER
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        CheckConstraint(
            "role IN ('ADMIN', 'USER')",
            name="chk_users_role",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'DISABLED')",
            name="chk_users_status",
        ),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="USER",
        server_default="USER",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="ACTIVE",
        server_default="ACTIVE",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


class Election(Base):
    __tablename__ = "elections"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'OPEN', 'CLOSED')",
            name="chk_elections_status",
        ),
        CheckConstraint(
            "privacy_mode IN "
            "('FORCED_ANONYMOUS', 'OPTIONAL_ANONYMOUS', 'IDENTIFIED')",
            name="chk_elections_privacy_mode",
        ),
        CheckConstraint(
            "ends_at > starts_at",
            name="chk_elections_time",
        ),
        Index(
            "idx_elections_status_time",
            "status",
            "starts_at",
            "ends_at",
        ),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    position_title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
            name="fk_elections_created_by",
        ),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="DRAFT",
        server_default="DRAFT",
    )
    privacy_mode: Mapped[str] = mapped_column(String(30), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    results_published_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


class ElectionCandidate(Base):
    __tablename__ = "election_candidates"
    __table_args__ = (
        UniqueConstraint(
            "election_id",
            "id",
            name="uq_candidates_election_id_id",
        ),
        Index(
            "idx_candidates_election_order",
            "election_id",
            "display_order",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    election_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "elections.id",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
            name="fk_candidates_election",
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


class ElectionVoter(Base):
    __tablename__ = "election_voters"
    __table_args__ = (
        CheckConstraint(
            "vote_quota > 0",
            name="chk_election_voters_vote_quota",
        ),
        Index(
            "idx_election_voters_user",
            "user_id",
            "election_id",
        ),
    )

    election_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "elections.id",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
            name="fk_election_voters_election",
        ),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
            name="fk_election_voters_user",
        ),
        primary_key=True,
    )
    vote_quota: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        nullable=False,
        default=1,
        server_default="1",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        server_onupdate=func.current_timestamp(),
    )


class VoteParticipation(Base):
    __tablename__ = "vote_participation"
    __table_args__ = (
        ForeignKeyConstraint(
            ["election_id", "user_id"],
            [
                "election_voters.election_id",
                "election_voters.user_id",
            ],
            name="fk_participation_eligible_voter",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        UniqueConstraint(
            "election_id",
            "user_id",
            "vote_sequence",
            name="uq_participation_sequence",
        ),
        CheckConstraint(
            "vote_sequence > 0",
            name="chk_participation_vote_sequence",
        ),
        Index(
            "idx_participation_voter",
            "election_id",
            "user_id",
        ),
        Index(
            "idx_participation_user_election",
            "user_id",
            "election_id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    election_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        nullable=False,
    )
    vote_sequence: Mapped[int] = mapped_column(
        INTEGER(unsigned=True),
        nullable=False,
    )
    voted_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )


class Ballot(Base):
    __tablename__ = "ballots"
    __table_args__ = (
        ForeignKeyConstraint(
            ["election_id", "voter_id"],
            [
                "election_voters.election_id",
                "election_voters.user_id",
            ],
            name="fk_ballots_identified_voter",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        UniqueConstraint(
            "election_id",
            "id",
            name="uq_ballots_election_id_id",
        ),
        CheckConstraint(
            "("
            "is_anonymous = TRUE AND voter_id IS NULL"
            ") OR ("
            "is_anonymous = FALSE AND voter_id IS NOT NULL"
            ")",
            name="chk_ballots_anonymous",
        ),
        Index(
            "idx_ballots_election_submitted",
            "election_id",
            "submitted_at",
        ),
        Index(
            "idx_ballots_election_voter",
            "election_id",
            "voter_id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    election_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "elections.id",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
            name="fk_ballots_election",
        ),
        nullable=False,
    )
    voter_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        nullable=True,
    )
    is_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )


class BallotChoice(Base):
    __tablename__ = "ballot_choices"
    __table_args__ = (
        UniqueConstraint(
            "ballot_id",
            name="uq_ballot_choices_ballot",
        ),
        ForeignKeyConstraint(
            ["election_id", "ballot_id"],
            [
                "ballots.election_id",
                "ballots.id",
            ],
            name="fk_ballot_choices_ballot",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["election_id", "candidate_id"],
            [
                "election_candidates.election_id",
                "election_candidates.id",
            ],
            name="fk_ballot_choices_candidate",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        Index(
            "idx_ballot_choices_candidate",
            "election_id",
            "candidate_id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    election_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        nullable=False,
    )
    ballot_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        nullable=False,
    )
    candidate_id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index(
            "idx_audit_logs_actor_time",
            "actor_user_id",
            "created_at",
        ),
        Index(
            "idx_audit_logs_resource",
            "resource_type",
            "resource_id",
            "created_at",
        ),
    )

    id: Mapped[int] = mapped_column(
        BIGINT(unsigned=True),
        primary_key=True,
        autoincrement=True,
    )
    actor_user_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
            onupdate="RESTRICT",
            name="fk_audit_logs_actor",
        ),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        nullable=True,
    )
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

# ============================================================
# Schema initialization
# ============================================================

def main() -> None:
    from sqlalchemy import create_engine

    from env_config import load_settings

    settings = load_settings()

    engine = create_engine(
        settings.database_url(),
        pool_pre_ping=True,
    )

    Base.metadata.create_all(engine)
    engine.dispose()

    print("Database tables created successfully.")


if __name__ == "__main__":
    main()
