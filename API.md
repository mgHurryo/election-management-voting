# API Specification

English / [简体中文](docs/api/API_CN.md)

> Document version: **API v0.1 draft** · Updated: **2026-10-01 (Asia/Hong_Kong)**
> Baseline: SRS v0.1, Architecture v0.2, Git `b74cd1647a3e85796f3b1c9ae5c1cdac677c62bf`.
> **A design contract awaiting review and implementation, not verified documentation of a running service.** The baseline contains database bootstrap code but no FastAPI routes, request/response models, application entry point or API tests. Every operation below is planned.

## 1. Sources and scope

- [Requirements](REQUIREMENTS.md): FR-01–FR-14, BR-01–BR-12 and AC-01–AC-08.
- [Architecture](ARCHITECTURE.md): section 4 on data/transactions and sections 8–11 on APIs/security, particularly the v1 limits in section 4.21 and ADR-008.
- [Future Work](FUTURE.md): deferred capabilities and permanent exclusions.
- [Database schema](backend/database/init/01_init_schema.py): check fields, lengths and constraints against the committed baseline above, not uncommitted local code; do not run bootstrap scripts for documentation.

The SRS controls scope; database reservations do not enable features. Serialization, pagination, payload composition and error handling introduced here are **API design proposals**, not existing implementation or previously approved meeting decisions. Section 8 identifies key review items. Maintain both languages together; business changes require SRS/architecture/acceptance updates first.

v1 supports only **one position per election, one selection, one vote per person, forced anonymity and highest vote count wins**.

No account administration `/users`, registration, refresh tokens, audit queries, exports, email, live turnout, photo uploads, vote receipts, saved-ballot lookup/withdrawal/update/deletion, multiple rounds, multiple votes, identified voting or automated tie-break API is defined. `/users` in architecture section 8 is a reserved resource; account administration remains FW-08. Accounts are prepared through authorized seed/deployment workflows.

## 2. Common conventions

### 2.1 Transport and authentication

| Item | Contract |
| --- | --- |
| Base path | `/api/v1`; deployment hostname and port are undecided. |
| Format | JSON; requests with JSON bodies use `Content-Type: application/json`; JSON responses use `application/json`. Production must use HTTPS. |
| Authentication | Except login, use `Authorization: Bearer <access-token>`. Resolve identity from verified JWTs, not client claims. |
| Invalid identity | Missing/invalid/expired token, or an account no longer ACTIVE, returns `401 AUTHENTICATION_REQUIRED` with `WWW-Authenticate: Bearer`. |
| Roles | `ADMIN` manages elections; `USER` needs membership to vote. ADMIN has no v1 voting role. |
| Caching | Authentication, self-participation, ballot and result responses, including errors, use `Cache-Control: no-store`. |
| Input allowlist | Accept only declared body/query fields; unknown fields or an unexpected body return `422 VALIDATION_ERROR`. |

Recheck account validity, role, ownership and eligibility on each request. Hiding UI controls does not authorize an operation. A roster-management `user_id` identifies the target, never the caller.

### 2.2 Types, time and updates

| Type / rule | Draft convention |
| --- | --- |
| `ID` | Positive decimal string matching `^[1-9][0-9]*$`, numerically at most `18446744073709551615`; applies to path IDs too. Avoids precision loss when MySQL BIGINT UNSIGNED is represented by JavaScript Number. |
| `Timestamp` | RFC 3339, explicit timezone, whole-second precision. Accept `Z` or an offset; output UTC `Z`. `2026-10-02T10:00:00+08:00` and `2026-10-02T02:00:00Z` are the same instant. Implementation must normalize DATETIME reads/writes to UTC. |
| Voting window | Preserve SRS AC-08: `starts_at <= server_now <= ends_at`, including both ends; expiry is strictly after ends_at. Re-read server time after obtaining locks; do not trust browser clocks. |
| Integers | JSON integers, not coerced booleans, fractions or strings. Query page/page_size use positive-integer strings. |
| Text | Character limits; required names, titles and introductions cannot be whitespace-only. Boundary whitespace may be trimmed before validation, except passwords must not be modified. Render responses as text. |
| PATCH | Update explicit fields only; omission preserves values; only declared nullable fields accept null; empty objects return `422`. |
| Read-only | IDs, state, creator, timestamps and derived values cannot be written back; state changes use dedicated operations. |

Writes of recognized but disabled `OPTIONAL_ANONYMOUS` / `IDENTIFIED` return `400 PRIVACY_MODE_VIOLATION`; unknown mode strings return `422`. `vote_quota` accepts only integer 1. Publication is represented by `results_published_at`, not an additional `PUBLISHED` state.

### 2.3 Responses, pagination and errors

Object envelope: `{"data": <model>}`. `204` has no body, including no data wrapper. Every response field in section 3 is present; nullable values are null.

Election, candidate and roster lists are paginated: page defaults to 1, minimum 1; page_size defaults to 20, range 1–100. Pages beyond the end return an empty array with the true total. Apply visibility before totals/pagination; order IDs numerically, not lexicographically.

```json
{
  "data": [],
  "meta": {"page": 1, "page_size": 20, "total": 0}
}
```

Use one error envelope. Clients branch on code, not message text. Optional details contains only field paths and static reasons, never input, passwords, tokens or voting choices. Convert default framework validation errors instead of mixing a second detail structure into the contract.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{"field": "body.candidate_id", "reason": "Expected a positive decimal ID string."}]
  }
}
```

## 3. Models and fields

The table describes objects inside `data`, not new database tables. All examples are fictional and do not imply a deployed service.

### 3.1 Response models

| Model | Fields, types and constraints |
| --- | --- |
| `User` | `id: ID`; `username: string(1–50)`; `display_name: string(1–100)`; `role: ADMIN/USER`; `status: ACTIVE/DISABLED`; `created_at, updated_at: Timestamp`. No password/password_hash. |
| `Token` | `access_token: string`; `token_type: "bearer"`; `expires_in: positive integer seconds`, from deployment configuration, not yet decided; `user: User`. |
| `Election` | `id: ID`; `title: string(1–200)`; `position_title: string(1–100)`; `description: string(up to 10000) or null`; `created_by: ID`; `status: DRAFT/OPEN/CLOSED`; `privacy_mode: FORCED_ANONYMOUS`; `starts_at, ends_at: Timestamp`; `results_published_at: Timestamp or null`; `created_at, updated_at: Timestamp`. |
| `Candidate` | `id, election_id: ID`; `name: string(1–100)`; `position_title: string`, derived from Election; `description: string(1–10000)`; `photo_url: HTTPS URL(up to 500 characters) or null`; `display_order: integer 0–2147483647`; `created_at, updated_at: Timestamp`. Duplicate names allowed; no candidate account required. |
| `Voter` | `election_id, user_id: ID` (composite key, no independent row ID); `display_name: string` (from account); `vote_quota: 1`; `created_at, updated_at: Timestamp` (membership times, not voting times). |
| `Participation` | `election_id: ID`; `eligible: boolean`; `vote_quota, used_votes, remaining_votes: integer 0 or 1`. If eligible, quota=1 and remaining=quota-used; outside the roster, eligible=false and all three counts are 0. |
| `BallotView` | `election: Election`; `candidates: Candidate[]` (all candidates, not paginated); `participation: Participation` (caller only). Not a saved ballot resource. |
| `VoteAccepted` | `election_id: ID`; `accepted: true`. No candidate echo, ballot_id, receipt or submission time. |
| `CandidateResult` | `candidate_id: ID`; `name: string`; `vote_count: nonnegative integer`. |
| `Result` | `election_id: ID`; `position_title: string`; `results_published_at: Timestamp or null`; `total_votes: nonnegative integer`; `candidates: CandidateResult[]`; `winner_candidate_id: ID or null`. |

Derive counts and remaining quota from existing data, without duplicate state. Result includes zero-vote candidates, ordered by vote_count descending, then candidate display_order and numeric id ascending. total_votes is the sum of candidate counts. winner_candidate_id is populated only for a unique leader with total_votes > 0; tied or zero-vote outcomes return null. Sorting is not a tie-break. See D-06 for exceptional publication.

### 3.2 Create and update requests

| Request model | Writable fields |
| --- | --- |
| `Login` | Required `username: nonblank string, at most 50 characters`, `password: nonempty string`; never trim passwords. Password policy and hashing remain implementation decisions. |
| `ElectionCreate` | Required title, position_title, starts_at, ends_at (Election types/lengths); required `voter_ids: nonempty, unique ID[]`; optional description (default null), privacy_mode (defaults to and only allows FORCED_ANONYMOUS). |
| `ElectionPatch` | Nonempty subset of title, position_title, description, starts_at, ends_at, privacy_mode; only description accepts null; validate starts_at < ends_at after merging; no voter_ids. |
| `CandidateCreate` | Required name, description; optional photo_url (default null), display_order (default 0); constraints as Candidate. |
| `CandidatePatch` | Nonempty subset of CandidateCreate; only photo_url accepts null. |
| `VoterCreate` | Required `user_id: ID`; optional `vote_quota: 1` (default 1). Target must be an existing ACTIVE USER. |
| `VoteCreate` | Only required `candidate_id: ID`; reject candidate_ids arrays, user_id, voter_id, is_anonymous, ballot_id and client quota values. |

The candidate position comes from elections.position_title, without duplicate storage. FR-03 requires an introduction even though the database description is nullable. Draft photo URLs must use HTTPS; no upload or server-side URL fetching is defined.

### 3.3 Request and response examples

Login request (the placeholder is not a real credential):

```json
{"username":"demo_voter","password":"<demo-password>"}
```

Create an election; voter_ids defines the initial eligible scope, not a new elections column:

```json
{
  "title": "Class Representative Election",
  "position_title": "Class Representative",
  "description": "One seat; one choice per voter.",
  "starts_at": "2026-10-02T02:00:00Z",
  "ends_at": "2026-10-02T04:00:00Z",
  "voter_ids": ["21", "22"]
}
```

`201` Election:

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "One seat; one choice per voter.",
    "created_by": "11",
    "status": "DRAFT",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-01T01:00:00Z"
  }
}
```

Add a candidate:

```json
{"name":"Candidate A","description":"A fictional introduction.","photo_url":null,"display_order":0}
```

Add a roster member:

```json
{"user_id":"23","vote_quota":1}
```

Update an introduction, preserving other fields:

```json
{"description":"Updated candidate introduction."}
```

Vote request and `201` response:

```json
{"candidate_id":"101"}
```

```json
{"data":{"election_id":"1001","accepted":true}}
```

Self-participation after voting, without the previous choice:

```json
{"data":{"election_id":"1001","eligible":true,"vote_quota":1,"used_votes":1,"remaining_votes":0}}
```

Published result, with one valid ballot in this example:

```json
{
  "data": {
    "election_id": "1001",
    "position_title": "Class Representative",
    "results_published_at": "2026-10-02T04:05:00Z",
    "total_votes": 1,
    "candidates": [
      {"candidate_id":"101","name":"Candidate A","vote_count":1},
      {"candidate_id":"102","name":"Candidate B","vote_count":0}
    ],
    "winner_candidate_id": "101"
  }
}
```

## 4. Operation inventory and contracts

Paths are relative to `/api/v1`. Successful objects use section 3's data wrapper; lists use a data array plus meta. Undeclared query/body fields are not accepted. Every operation inherits common `401`, role `403`, schema `422` and server `500`; errors below highlight business cases.

| # | Method | Path | Permission | Success model |
| --- | --- | --- | --- | --- |
| 1 | POST | `/auth/login` | Public | 200 Token |
| 2 | GET | `/auth/me` | Authenticated | 200 User |
| 3 | GET | `/elections` | Authenticated | 200 Election[] + meta |
| 4 | POST | `/elections` | ADMIN | 201 Election |
| 5 | GET | `/elections/{election_id}` | Authenticated, visible scope | 200 Election |
| 6 | PATCH | `/elections/{election_id}` | ADMIN | 200 Election |
| 7 | POST | `/elections/{election_id}/open` | ADMIN | 200 Election |
| 8 | POST | `/elections/{election_id}/close` | ADMIN | 200 Election |
| 9 | GET | `/elections/{election_id}/candidates` | ADMIN / eligible USER | 200 Candidate[] + meta |
| 10 | POST | `/elections/{election_id}/candidates` | ADMIN | 201 Candidate |
| 11 | PATCH | `/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 200 Candidate |
| 12 | DELETE | `/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 204 no body |
| 13 | GET | `/elections/{election_id}/voters` | ADMIN | 200 Voter[] + meta |
| 14 | POST | `/elections/{election_id}/voters` | ADMIN | 201 Voter |
| 15 | DELETE | `/elections/{election_id}/voters/{user_id}` | ADMIN | 204 no body |
| 16 | GET | `/elections/{election_id}/ballot` | Eligible USER | 200 BallotView |
| 17 | GET | `/elections/{election_id}/participation` | USER | 200 Participation |
| 18 | POST | `/elections/{election_id}/votes` | Eligible USER | 201 VoteAccepted |
| 19 | GET | `/elections/{election_id}/results` | ADMIN / USER after publication | 200 Result |
| 20 | POST | `/elections/{election_id}/results/publish` | ADMIN | 200 Result |

### 4.1 Login

`POST /api/v1/auth/login`

- Request: Login; no query. Success: 200 Token.
- Check password and account status. Unknown user, wrong password and disabled account all return `401 INVALID_CREDENTIALS` to avoid account enumeration.
- JWT lifetime/signing configuration comes from the environment, not hard-coded examples. Hashing and frontend token storage remain undecided. No registration, refresh or server logout operation is introduced.

### 4.2 Current identity

`GET /api/v1/auth/me`

- No body/query. Success: 200 User.
- Resolve the account from a verified JWT. A subsequently disabled account returns `401 AUTHENTICATION_REQUIRED` even if the token has not expired.
- Do not accept a user_id selector for another account.

### 4.3 Election list

`GET /api/v1/elections`

- Query: page, page_size, optional status (DRAFT / OPEN / CLOSED); no body.
- ADMIN sees all; USER sees own roster elections and all published elections. Sort by numeric id descending; filter visibility before pagination.
- Success: 200 Election[] + meta; empty collection is data=[] and total=0. No live counts, other voters or unpublished results.

### 4.4 Create election

`POST /api/v1/elections`

- ADMIN; request ElectionCreate; success 201 Election in DRAFT.
- starts_at must precede ends_at. voter_ids must be unique existing ACTIVE USER accounts; obtain IDs through authorized seed/deployment data.
- Create election and initial memberships atomically, with quota 1; roll back everything if any account is invalid. Derive created_by from the current ADMIN. Add candidates afterwards.
- Errors: `USER_NOT_FOUND`, `INVALID_VOTER`, `INVALID_TIME_RANGE`, `PRIVACY_MODE_VIOLATION`; duplicate voter_ids is `VALIDATION_ERROR`.

### 4.5 Election detail

`GET /api/v1/elections/{election_id}`

- No body/query; success 200 Election. Same visibility as the list.
- Absent or invisible elections return `404 ELECTION_NOT_FOUND`. Do not include candidates, other voters or vote counts.

### 4.6 Update draft election

`PATCH /api/v1/elections/{election_id}`

- ADMIN; DRAFT only; request ElectionPatch; success 200 Election.
- Validate the merged time range. Reject id, created_by, status, results_published_at and voter_ids; use membership operations to change eligibility.
- A DRAFT update racing with open must not commit after the election becomes OPEN.
- Errors: `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`, `INVALID_TIME_RANGE`, `PRIVACY_MODE_VIOLATION`.

### 4.7 Open voting

`POST /api/v1/elections/{election_id}/open`

- ADMIN; no body/query; only DRAFT → OPEN; success 200 Election.
- Require the inclusive time window, at least one candidate with every candidate valid, and one ACTIVE USER member; every quota is 1 and privacy_mode is FORCED_ANONYMOUS.
- Atomically validate and transition. Repeated open or reopening CLOSED returns `INVALID_STATE_TRANSITION`. No scheduler is introduced.
- Errors: `ELECTION_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `ELECTION_NOT_READY`, `VOTING_NOT_STARTED`, `VOTING_ENDED`.

### 4.8 Close voting

`POST /api/v1/elections/{election_id}/close`

- ADMIN; no body/query; only OPEN → CLOSED; success 200 Election.
- Early close and close after ends_at are allowed, enabling counting/publication. Repeated close returns `INVALID_STATE_TRANSITION`.
- Take the exclusive election lock, wait for in-flight voting, commit CLOSED, then return success. Even if stored state remains OPEN, elapsed elections must reject votes.
- Errors: `ELECTION_NOT_FOUND`, `INVALID_STATE_TRANSITION`.

### 4.9 Candidate list

`GET /api/v1/elections/{election_id}/candidates`

- Query: page, page_size; no body; success 200 Candidate[] + meta. Sort by display_order, then numeric id ascending.
- ADMIN may read in any state. USER needs membership, OPEN and the voting time window, matching ballot access so this operation cannot bypass FR-07 / FR-08.
- Eligible users who already voted may read, without their previous choice. After closing, ordinary users read published results instead.
- Errors: `ELECTION_NOT_FOUND`, `NOT_ELIGIBLE`, `ELECTION_NOT_OPEN`, `VOTING_NOT_STARTED`, `VOTING_ENDED`.

### 4.10 Add candidate

`POST /api/v1/elections/{election_id}/candidates`

- ADMIN; DRAFT only; request CandidateCreate; success 201 Candidate.
- election_id comes from the path and position_title from the election; neither is writable in the body. No candidate account or name deduplication is required.
- Errors: `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

### 4.11 Update candidate

`PATCH /api/v1/elections/{election_id}/candidates/{candidate_id}`

- ADMIN; DRAFT only; request CandidatePatch; success 200 Candidate.
- Check candidate_id within the path election, not a global ID-only update; no election transfer or independent position edit.
- Errors: `ELECTION_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

### 4.12 Delete draft candidate

`DELETE /api/v1/elections/{election_id}/candidates/{candidate_id}`

- ADMIN; DRAFT only; no body/query; success 204 without a body.
- Candidate must belong to this election and have no ballot reference. Never cascade-delete ballots; an existing reference returns `RESOURCE_CONFLICT`.
- Missing, cross-election or already-deleted candidate returns `CANDIDATE_NOT_FOUND`; also `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

### 4.13 Voter roll

`GET /api/v1/elections/{election_id}/voters`

- ADMIN; any election state; query page, page_size; no body; success 200 Voter[] + meta.
- Sort by numeric user_id ascending. Return membership metadata only, not ballot IDs, choices, voting timestamps or personal voting history.
- USER cannot list other voters. Errors: `ELECTION_NOT_FOUND`, `PERMISSION_DENIED`.

### 4.14 Add voter

`POST /api/v1/elections/{election_id}/voters`

- ADMIN; DRAFT only; request VoterCreate; success 201 Voter.
- Require an existing ACTIVE USER. Deduplicate by (election_id, user_id); duplicate membership returns `409 VOTER_ALREADY_EXISTS`, without a second row.
- No bulk import, quota editor or account creation. Quota other than 1 returns `422 VALIDATION_ERROR`.
- Other errors: `ELECTION_NOT_FOUND`, `USER_NOT_FOUND`, `INVALID_VOTER`, `ELECTION_NOT_EDITABLE`.

### 4.15 Remove voter

`DELETE /api/v1/elections/{election_id}/voters/{user_id}`

- ADMIN; DRAFT only; no body/query; success 204 without a body.
- Delete only membership, never accounts or participation. Existing participation returns `RESOURCE_CONFLICT`. Removing the final member in DRAFT is allowed, but opening then fails readiness checks.
- Missing or already-deleted membership returns `VOTER_NOT_FOUND`; also `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

### 4.16 Ballot view

`GET /api/v1/elections/{election_id}/ballot`

- Eligible ACTIVE USER; no body/query; success 200 BallotView.
- Require membership, OPEN and the time window. Return all candidates ordered by display_order then numeric id, plus caller-only participation; no pagination.
- Already-voted users may read with remaining_votes=0, without their prior choice. This view neither reserves quota nor reads a saved ballot.
- Errors: `ELECTION_NOT_FOUND`, `NOT_ELIGIBLE`, `ELECTION_NOT_OPEN`, `VOTING_NOT_STARTED`, `VOTING_ENDED`. ADMIN receives `PERMISSION_DENIED`.

### 4.17 Self-participation

`GET /api/v1/elections/{election_id}/participation`

- ACTIVE USER; no body/query; success 200 Participation. No user_id selector for others.
- Available in DRAFT, OPEN and CLOSED, regardless of publication. Missing election is `ELECTION_NOT_FOUND`; for an existing election a non-member receives eligible=false with all counts 0.
- This is an explicit exception to election-detail visibility, explaining ineligibility without exposing a roster. ADMIN receives `PERMISSION_DENIED`.
- No user identity, candidate, ballot_id or voting timestamp. During timeout recovery, it is only a snapshot of committed state, not proof that a pending request cannot later succeed.

### 4.18 Cast anonymous vote

`POST /api/v1/elections/{election_id}/votes`

- Eligible ACTIVE USER; request VoteCreate; success 201 VoteAccepted. ADMIN cannot vote.
- Recheck membership, OPEN, time and remaining quota inside the transaction. Missing or cross-election candidate_id returns the same `400 INVALID_CANDIDATE`.
- Atomically write participation + anonymous ballot + choice, without incrementing result totals. A concurrent second request cannot overwrite the first ballot.
- Return success only after commit. No candidate echo, ballot ID, receipt URL, submission time or Location identifying a saved ballot. No saved-vote read/update/delete operation exists.
- Errors: `ELECTION_NOT_FOUND`, `NOT_ELIGIBLE`, `ELECTION_NOT_OPEN`, `VOTING_NOT_STARTED`, `VOTING_ENDED`, `VOTE_QUOTA_EXHAUSTED`, `INVALID_CANDIDATE`. See section 6 for retries.

### 4.19 Count and read results

`GET /api/v1/elections/{election_id}/results`

- No body/query; success 200 Result.
- Count only CLOSED elections. ADMIN can recount before publication (results_published_at=null); USER reads only after publication.
- Follow the SRS: all ACTIVE USER accounts can read published results, including non-members; do not invent finer disclosure policies.
- Aggregate ballot_choices, including zero-vote candidates. GET does not publish, store snapshots or write counts. Tied/zero-vote results have a null winner, without automatic selection.
- Errors: `ELECTION_NOT_FOUND`; ADMIN before CLOSED gets `ELECTION_NOT_CLOSED`; USER before publication always gets `RESULTS_NOT_PUBLISHED`.

### 4.20 Publish results

`POST /api/v1/elections/{election_id}/results/publish`

- ADMIN; CLOSED only; no body/query; success 200 Result. Clients cannot supply totals, winners or publication timestamps.
- Recompute and set results_published_at using server time within the transaction. No PUBLISHED state or results table.
- Draft retry convention: lock the election row exclusively and check publication in that transaction. If already published, return the original result/publication time without overwriting the timestamp; concurrent requests must not publish twice.
- Draft safeguard: without a unique positive-vote winner, return `409 RESULT_NOT_DECIDED` and leave unpublished. **Requires D-06 review**, not an approved tie-break or automatic runoff.
- Other errors: `ELECTION_NOT_FOUND`, `ELECTION_NOT_CLOSED`.

## 5. HTTP statuses and error dictionary

200 means successful read/state operation, 201 successful creation/voting, and 204 successful bodyless deletion. Undeclared paths/methods are not promised APIs; implementation must still normalize framework 404/405 without exposing traces.

| HTTP | error.code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_CANDIDATE` | Submitted candidate is absent or belongs to another election. |
| 400 | `PRIVACY_MODE_VIOLATION` | Request enables a recognized but forbidden v1 mode. |
| 401 | `INVALID_CREDENTIALS` | Generic login failure, including disabled accounts. |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 403 | `NOT_ELIGIBLE` | Non-member attempts ballot/candidate viewing or voting. |
| 404 | `ROUTE_NOT_FOUND` | Requested API path is not defined. |
| 405 | `METHOD_NOT_ALLOWED` | Method is not supported on this path; include the Allow header. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 404 | `CANDIDATE_NOT_FOUND` | Candidate-management target absent or cross-election. |
| 404 | `USER_NOT_FOUND` | ADMIN-specified roster account does not exist. |
| 404 | `VOTER_NOT_FOUND` | Target membership does not exist. |
| 409 | `ELECTION_NOT_EDITABLE` | Mutation requires DRAFT. |
| 409 | `INVALID_STATE_TRANSITION` | Invalid or repeated open/close. |
| 409 | `ELECTION_NOT_READY` | No valid candidate/active voter, or invalid MVP configuration. |
| 409 | `ELECTION_NOT_OPEN` | Ballot viewing/voting requires OPEN. |
| 409 | `VOTING_NOT_STARTED` | Server time is before starts_at. |
| 409 | `VOTING_ENDED` | Server time is after ends_at. |
| 409 | `VOTE_QUOTA_EXHAUSTED` | Caller has consumed the single vote quota. |
| 409 | `VOTER_ALREADY_EXISTS` | Duplicate membership; do not create another row. |
| 409 | `RESOURCE_CONFLICT` | Existing reference/immutable record prevents safe mutation. |
| 409 | `ELECTION_NOT_CLOSED` | Counting/publication requires CLOSED. |
| 409 | `RESULTS_NOT_PUBLISHED` | USER requests an unpublished result. |
| 409 | `RESULT_NOT_DECIDED` | No unique positive-vote winner; draft safeguard pending D-06. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 422 | `INVALID_TIME_RANGE` | Merged starts_at does not precede ends_at. |
| 422 | `INVALID_VOTER` | Existing account is not ACTIVE or not USER. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Business-check order: authentication/role → election and eligibility → state → time → candidate → quota. Schema validation can precede business logic, so malformed requests have no promised 401-versus-422 ordering. A structurally valid vote outside OPEN gets ELECTION_NOT_OPEN; OPEN outside the window gets a time error; quota is checked last. Unauthorized callers must not learn the existence of another election's candidate through errors.

```json
{"error":{"code":"VOTE_QUOTA_EXHAUSTED","message":"No remaining vote quota."}}
```

## 6. Workflows, concurrency, retries and privacy

### 6.1 Minimal workflow

1. ADMIN logs in, confirms identity with `/auth/me`, then POST /elections creates DRAFT plus initial membership.
2. In DRAFT, add/update candidates and membership; call `/open` after the start time.
3. USER logs in, reads participation and ballot, chooses one candidate and POSTs /votes once.
4. Show success only after 201; disable duplicate submission while pending; handle uncertain outcomes as below.
5. ADMIN calls `/close`, GETs /results to recount, then POSTs /results/publish; USER reads the published result.

The following **POSIX shell** example has not been run against a service. API_BASE_URL includes `/api/v1`; ACCESS_TOKEN is a controlled test account token. The election must be OPEN and within its window, and the candidate must belong to it. Never store tokens in the repository, logs or screenshots.

```bash
# API_BASE_URL and ACCESS_TOKEN are supplied by the test environment.
curl --fail-with-body --request GET \
  "$API_BASE_URL/elections/1001/ballot" \
  --header "Authorization: Bearer $ACCESS_TOKEN"

# Send once. Do not enable automatic POST retries.
curl --fail-with-body --request POST \
  "$API_BASE_URL/elections/1001/votes" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"candidate_id":"101"}'
```

### 6.2 Timeouts and retries

- A vote timeout, disconnect or 500 does not prove failure; the transaction may have committed before the response was lost. Do not automatically resubmit.
- Query self-participation with bounded polling: used_votes=1 confirms quota use, not the choice; never guess and display a candidate.
- used_votes=0 does not prove a pending request cannot later succeed. Keep the result uncertain; do not automatically vote again. If a user explicitly retries later, the quota/transaction checks still allow at most one ballot.
- `VOTE_QUOTA_EXHAUSTED` is a 409 failure, not replayed success; never return the original ballot.
- Election/candidate creation does not promise strict idempotency; query after a timeout before creating duplicates. Duplicate membership returns 409. Repeated deletion may return 404 but cannot cause a second effect.
- Repeated open/close returns 409; GET the election to reconcile. Repeated publication returns the original timestamp without overwriting it.
- Polling/retries need finite timeouts and attempt limits; exact durations belong to implementation configuration, not invented performance guarantees.

### 6.3 Server transactions

Reuse architecture section 4.12 and ADR-007:

1. Lock in the order elections → election_voters.
2. Voting takes a shared election lock, rechecks state and server time in the transaction, then exclusively locks the current roster row and recounts used_votes.
3. Write vote_participation, ballots and ballot_choices in one transaction; roll back all writes on any failure; do not return success before commit.
4. v1 requires ballots.voter_id=NULL; participation has no ballot_id and ballots have no participation ID.
5. close takes the exclusive election lock and waits for in-flight votes; after close commits, no new ballot may be written. DRAFT edits/open also coordinate so a DRAFT check cannot commit after opening.
6. Count candidate votes from ballot_choices, not participation, and do not increment result totals during vote writes.

Preventing quota races is not strict HTTP response replay. v1 has no Idempotency-Key or deduplication table; a future deduplication mechanism must not link identity to ballot/candidate.

### 6.4 Privacy boundary

- No role can retrieve a saved individual ballot or reverse-resolve its voter.
- Do not log vote bodies, JWTs, passwords or full Authorization headers, especially user_id + candidate_id or user_id + ballot_id. Proxies, APM, error tracking and audit logging follow the same rule.
- Validation errors expose only field paths and static reasons; never echo vote input. Correlation IDs must not enter ballot storage or become identity-to-ballot indexes.
- The architecture provides **direct identity unlinking**, not cryptographic anonymity or resistance to timestamp/insertion-order correlation. Review the gap against the stronger FR-11/NFR-2 wording; do not claim it is resolved.
- CORS allowlists, token storage, rate limiting and deployment gates remain implementation decisions. This document changes no environment or permission.

## 7. Traceability and acceptance checklist

The following are **API/integration tests to run after implementation**, not tests executed for this documentation change. Static documentation checks cannot prove authorization, transactions or anonymity.

| Requirement | Operations / contract | Key acceptance and negative cases |
| --- | --- | --- |
| FR-01 / AC-01 | POST /elections; GET list/detail | Preserve title and position_title; atomically create initial membership; roll back for invalid account. |
| FR-02 / BR-07 | Create/PATCH; POST /votes | Fixed one position, forced anonymity, quota 1; reject multi-choice, extra votes and identified settings. |
| FR-03 | Candidate GET/POST/PATCH/DELETE | Required introduction, optional photo, duplicate names allowed; reject cross-election IDs, post-OPEN edits and referenced deletes. |
| FR-04 | Voter GET/POST/DELETE | Deduplicate; reject invalid accounts and USER access to other rosters. |
| FR-05 | login/me and common auth | Wrong password, disabled account, expired/forged token denied; no credential leakage. |
| FR-06 | Per-operation permission matrix | USER admin actions 403; ADMIN voting 403; ownership, filtered lists and totals agree. |
| FR-07 / AC-03 | ballot/candidates/votes | Ineligible users cannot view/vote; self participation may return false without exposing roster. |
| FR-08 / AC-02 | GET /ballot | Position and all candidates shown; already-voted user sees remaining 0, not prior choice. |
| FR-09 / AC-02 | POST /votes | 201 only after commit; injected failure rolls back all three write types. |
| FR-10 / AC-04 | votes/participation | Two concurrent submissions yield at most one 201, one 409; original ballot unchanged. |
| FR-11 / AC-07 | Models, responses, logs | No identity↔ballot mapping, ballot receipt ID or request-body log; separately review metadata risk. |
| FR-12 / AC-06 | GET /results | Recount agrees, zero-vote candidates retained, sum(vote_count)=total_votes; GET does not publish. |
| FR-13 / AC-05, AC-08 | open/close/votes | Reject before start/after end; exact endpoints follow closed interval; close races follow locks. |
| FR-14 / AC-06 | publish/results | Unpublished result hidden from USER; repeat publish preserves time; ties/zero votes do not select arbitrarily. |

Additional boundaries: IDs above JavaScript safe integer but within BIGINT round-trip as strings; zero/negative/overflow IDs fail; naive timestamps fail; PATCH omission differs from null; page_size 0/101 fails; empty/out-of-range pages; redacted error details; participation may remain 0 while a timed-out request is pending; disabled accounts with unexpired tokens remain denied.

## 8. Review decisions and implementation handoff

| ID | Draft decision / open point | Basis and confirmation required |
| --- | --- | --- |
| D-01 | String IDs, explicit timezone/UTC, second precision, extra-field rejection, page cap 100 and API text limits. | DB types/lengths come from architecture; serialization and added limits are proposals requiring frontend/backend agreement. Preserve the SRS closed interval. |
| D-02 | USER election list = own roster + published; non-member self participation is false; all ACTIVE users read published results. | Result visibility comes from FR-14; list/self-status exceptions are draft conventions. Finer visibility remains FW-13. |
| D-03 | Nonempty voter_ids atomically creates membership; open requires a valid candidate and active voter. | FR-01 requires eligible scope; architecture permits staged configuration. This payload composition is proposed here. Seed must provide valid account IDs; no account API. |
| D-04 | Candidate introduction required, position inherited, photo optional and HTTPS-only. | FR-03 plus nullable database column; no duplicate position column, upload or mandatory-photo policy. |
| D-05 | ADMIN does not vote; only ACTIVE USER enters roster; DRAFT writes coordinate with open. | Architecture 10.2/ADR-007; implement and test account checks and lock coordination. |
| D-06 | CLOSED ADMIN preview; repeated publication preserves time; tie/zero winner=null and publication temporarily rejects. | FW-10 has no tie rule; architecture mentions offline/manual handling. This is a **safety proposal awaiting confirmation**, not an approved tie-break/runoff API. |
| D-07 | No strict replay idempotency or multiple votes; direct unlinking is not unlinkable anonymity. | Architecture 11.5/15; confirm uncertain-outcome UX, redacted logging and threat model against FR-11/NFR-2. |
| D-08 | Hash algorithm, JWT lifetime, token storage, seed, CORS, client timeout, rate limiting and deployment URL remain undecided. | Inherits architecture Open Issues; examples are not approved configuration; no quantitative performance gate exists. |

Implementation should reuse FastAPI/Pydantic routes, validation, response models and OpenAPI generation rather than maintain a second field-definition source. This document does not provide a handwritten OpenAPI file or claim `/docs`/`/openapi.json` availability. After routes exist, export OpenAPI and verify all 20 operations, permissions, enums and sanitized errors; response models must prevent accidental ORM-field leakage.

Only actual API/integration tests can promote this from a design draft to implemented API documentation. This change does not migrate the database, add dependencies, change SRS/architecture decisions or establish service availability.

## 9. Revision history

| Date | Version | Change |
| --- | --- | --- |
| 2026-10-01 | API v0.1 draft | Established bilingual contracts for 20 planned operations, with models, errors, privacy, traceability and acceptance checks; marked new decisions for review. |
