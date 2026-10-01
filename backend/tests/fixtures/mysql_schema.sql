CREATE TABLE users (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, 
	username VARCHAR(50) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	display_name VARCHAR(100) NOT NULL, 
	`role` VARCHAR(20) NOT NULL DEFAULT 'USER', 
	status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_users_username UNIQUE (username), 
	CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'USER')), 
	CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'DISABLED'))
)

CREATE TABLE audit_logs (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, 
	actor_user_id BIGINT UNSIGNED, 
	action VARCHAR(100) NOT NULL, 
	resource_type VARCHAR(50) NOT NULL, 
	resource_id BIGINT UNSIGNED, 
	details JSON, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT fk_audit_logs_actor FOREIGN KEY(actor_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE RESTRICT
)

CREATE INDEX idx_audit_logs_actor_time ON audit_logs (actor_user_id, created_at)

CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id, created_at)

CREATE TABLE elections (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, 
	title VARCHAR(200) NOT NULL, 
	position_title VARCHAR(100) NOT NULL, 
	description TEXT, 
	created_by BIGINT UNSIGNED NOT NULL, 
	status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', 
	privacy_mode VARCHAR(30) NOT NULL, 
	starts_at DATETIME NOT NULL, 
	ends_at DATETIME NOT NULL, 
	results_published_at DATETIME, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT chk_elections_status CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')), 
	CONSTRAINT chk_elections_privacy_mode CHECK (privacy_mode IN ('FORCED_ANONYMOUS', 'OPTIONAL_ANONYMOUS', 'IDENTIFIED')), 
	CONSTRAINT chk_elections_time CHECK (ends_at > starts_at), 
	CONSTRAINT fk_elections_created_by FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

CREATE INDEX idx_elections_status_time ON elections (status, starts_at, ends_at)

CREATE INDEX ix_elections_created_by ON elections (created_by)

CREATE TABLE election_candidates (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, 
	election_id BIGINT UNSIGNED NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	photo_url VARCHAR(500), 
	display_order INTEGER NOT NULL DEFAULT '0', 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_candidates_election_id_id UNIQUE (election_id, id), 
	CONSTRAINT fk_candidates_election FOREIGN KEY(election_id) REFERENCES elections (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

CREATE INDEX idx_candidates_election_order ON election_candidates (election_id, display_order, id)

CREATE TABLE election_voters (
	election_id BIGINT UNSIGNED NOT NULL, 
	user_id BIGINT UNSIGNED NOT NULL, 
	vote_quota INTEGER UNSIGNED NOT NULL DEFAULT '1', 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (election_id, user_id), 
	CONSTRAINT chk_election_voters_vote_quota CHECK (vote_quota > 0), 
	CONSTRAINT fk_election_voters_election FOREIGN KEY(election_id) REFERENCES elections (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_election_voters_user FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

CREATE INDEX idx_election_voters_user ON election_voters (user_id, election_id)

CREATE TABLE ballots (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, 
	election_id BIGINT UNSIGNED NOT NULL, 
	voter_id BIGINT UNSIGNED, 
	is_anonymous BOOL NOT NULL, 
	submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT fk_ballots_identified_voter FOREIGN KEY(election_id, voter_id) REFERENCES election_voters (election_id, user_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT uq_ballots_election_id_id UNIQUE (election_id, id), 
	CONSTRAINT chk_ballots_anonymous CHECK ((is_anonymous = TRUE AND voter_id IS NULL) OR (is_anonymous = FALSE AND voter_id IS NOT NULL)), 
	CONSTRAINT fk_ballots_election FOREIGN KEY(election_id) REFERENCES elections (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

CREATE INDEX idx_ballots_election_submitted ON ballots (election_id, submitted_at)

CREATE INDEX idx_ballots_election_voter ON ballots (election_id, voter_id)

CREATE TABLE vote_participation (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, 
	election_id BIGINT UNSIGNED NOT NULL, 
	user_id BIGINT UNSIGNED NOT NULL, 
	vote_sequence INTEGER UNSIGNED NOT NULL, 
	voted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT fk_participation_eligible_voter FOREIGN KEY(election_id, user_id) REFERENCES election_voters (election_id, user_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT uq_participation_sequence UNIQUE (election_id, user_id, vote_sequence), 
	CONSTRAINT chk_participation_vote_sequence CHECK (vote_sequence > 0)
)

CREATE INDEX idx_participation_user_election ON vote_participation (user_id, election_id)

CREATE INDEX idx_participation_voter ON vote_participation (election_id, user_id)

CREATE TABLE ballot_choices (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, 
	election_id BIGINT UNSIGNED NOT NULL, 
	ballot_id BIGINT UNSIGNED NOT NULL, 
	candidate_id BIGINT UNSIGNED NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_ballot_choices_ballot UNIQUE (ballot_id), 
	CONSTRAINT fk_ballot_choices_ballot FOREIGN KEY(election_id, ballot_id) REFERENCES ballots (election_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_ballot_choices_candidate FOREIGN KEY(election_id, candidate_id) REFERENCES election_candidates (election_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

CREATE INDEX idx_ballot_choices_candidate ON ballot_choices (election_id, candidate_id)
