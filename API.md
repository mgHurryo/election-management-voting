# API Specification

English / [简体中文](docs/api/API_CN.md)

> Document version: **API v0.1 draft** · Updated: **2026-10-01 (Asia/Hong_Kong)**
> Baseline: SRS v0.1, Architecture v0.2, Git `b74cd1647a3e85796f3b1c9ae5c1cdac677c62bf`.
> **A design contract awaiting review and implementation, not verified documentation of a running service.** The baseline contains database bootstrap code but no FastAPI routes, request/response models, application entry point or API tests. Every operation below is planned.

> **How to read this reference:** go to the operation index, then read one endpoint from top to bottom. Each endpoint repeats its authentication, parameters, complete request/response examples, field tables, errors and rules. Shared conventions are summarized once and repeated where needed, so no schema-dictionary lookup is required. This revision reorganizes the existing contract; it does not change API behavior.

**Quick navigation:** [Common conventions](#common-conventions) · [Operation index](#api-index) · [Error dictionary](#error-dictionary) · [Workflow](#workflow) · [Acceptance](#acceptance) · [Open decisions](#review-decisions)

## 1. Sources and scope

- [Requirements](REQUIREMENTS.md): FR-01–FR-14, BR-01–BR-12 and AC-01–AC-08.
- [Architecture](ARCHITECTURE.md): section 4 on data/transactions and sections 8–11 on APIs/security, particularly the v1 limits in section 4.21 and ADR-008.
- [Future Work](FUTURE.md): deferred capabilities and permanent exclusions.
- [Database schema](backend/database/init/01_init_schema.py): check fields, lengths and constraints against the committed baseline above, not uncommitted local code; do not run bootstrap scripts for documentation.

The SRS controls scope; database reservations do not enable features. Serialization, pagination, payload composition and error handling introduced here are **API design proposals**, not existing implementation or previously approved meeting decisions. Section 8 identifies key review items. Maintain both languages together; business changes require SRS/architecture/acceptance updates first.

v1 supports only **one position per election, one selection, one vote per person, forced anonymity and highest vote count wins**.

No account administration `/users`, registration, refresh tokens, audit queries, exports, email, live turnout, photo uploads, vote receipts, saved-ballot lookup/withdrawal/update/deletion, multiple rounds, multiple votes, identified voting or automated tie-break API is defined. `/users` in architecture section 8 is a reserved resource; account administration remains FW-08. Accounts are prepared through authorized seed/deployment workflows.

<a id="common-conventions"></a>

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

Object envelope: `{"data": <model>}`. `204` has no body, including no data wrapper. Every response field listed at its operation is present; nullable values are null.

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

<a id="api-index"></a>

## 3. Operation index

Click the operation name. Full paths include /api/v1; role/state checks are repeated at each operation. Shared field summaries have been replaced by local per-field tables.

| Module | Operation | Method | Full path | Permission | Success |
| --- | --- | --- | --- | --- | --- |
| Authentication | [Login](#endpoint-1) | `POST` | `/api/v1/auth/login` | Public | 200 |
| Authentication | [Current identity](#endpoint-2) | `GET` | `/api/v1/auth/me` | Authenticated | 200 |
| Elections | [Election list](#endpoint-3) | `GET` | `/api/v1/elections` | Authenticated | 200 |
| Elections | [Create election](#endpoint-4) | `POST` | `/api/v1/elections` | ADMIN | 201 |
| Elections | [Election detail](#endpoint-5) | `GET` | `/api/v1/elections/{election_id}` | Authenticated, visible scope | 200 |
| Elections | [Update draft election](#endpoint-6) | `PATCH` | `/api/v1/elections/{election_id}` | ADMIN | 200 |
| Elections | [Open voting](#endpoint-7) | `POST` | `/api/v1/elections/{election_id}/open` | ADMIN | 200 |
| Elections | [Close voting](#endpoint-8) | `POST` | `/api/v1/elections/{election_id}/close` | ADMIN | 200 |
| Candidates | [Candidate list](#endpoint-9) | `GET` | `/api/v1/elections/{election_id}/candidates` | ADMIN / eligible USER | 200 |
| Candidates | [Add candidate](#endpoint-10) | `POST` | `/api/v1/elections/{election_id}/candidates` | ADMIN | 201 |
| Candidates | [Update candidate](#endpoint-11) | `PATCH` | `/api/v1/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 200 |
| Candidates | [Delete draft candidate](#endpoint-12) | `DELETE` | `/api/v1/elections/{election_id}/candidates/{candidate_id}` | ADMIN | 204 |
| Voter roster | [Voter roll](#endpoint-13) | `GET` | `/api/v1/elections/{election_id}/voters` | ADMIN | 200 |
| Voter roster | [Add voter](#endpoint-14) | `POST` | `/api/v1/elections/{election_id}/voters` | ADMIN | 201 |
| Voter roster | [Remove voter](#endpoint-15) | `DELETE` | `/api/v1/elections/{election_id}/voters/{user_id}` | ADMIN | 204 |
| Ballot and voting | [Ballot view](#endpoint-16) | `GET` | `/api/v1/elections/{election_id}/ballot` | Eligible USER | 200 |
| Ballot and voting | [Self-participation](#endpoint-17) | `GET` | `/api/v1/elections/{election_id}/participation` | USER | 200 |
| Ballot and voting | [Cast anonymous vote](#endpoint-18) | `POST` | `/api/v1/elections/{election_id}/votes` | Eligible USER | 201 |
| Results | [Count and read results](#endpoint-19) | `GET` | `/api/v1/elections/{election_id}/results` | ADMIN / USER after publication | 200 |
| Results | [Publish results](#endpoint-20) | `POST` | `/api/v1/elections/{election_id}/results/publish` | ADMIN | 200 |

## 4. Endpoint reference

Each endpoint below is self-contained. Examples are fictional and may illustrate different lifecycle stages; tokens and hostnames are placeholders. Non-JSON 204 responses intentionally have no field table or JSON body.

<a id="endpoint-1"></a>

### 4.1 Login

Exchange an account name and password for an access token and current identity.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/auth/login` |
| Authentication | Not required. |
| Permission | Public |
| Election state | Not election-specific. |
| Success status | 200 |
| Request format | HTTPS; JSON body with Content-Type: application/json. |

#### Request parameters

**Path parameters**

None.

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body** — `Login`

| Field | Type | Required | Nullable | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `username` | `string` | Yes | No | — | Nonblank login name, at most 50 characters. |
| `password` | `string` | Yes | No | — | Nonempty password; never trim or alter it. Hashing/password policy is undecided. |

Only the fields above are writable. Unknown/read-only fields or wrong JSON types return 422 VALIDATION_ERROR; JSON integers do not accept booleans, fractions or strings.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/auth/login HTTP/1.1
Host: api.example.invalid
Content-Type: application/json

{
  "username": "demo_voter",
  "password": "<demo-password>"
}
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Token` response is fully expanded below; all fields are present, with null only where declared.

`Cache-Control: no-store`

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.access_token` | `string` | No | JWT secret; do not store in logs. |
| `data.token_type` | `string` | No | Always bearer. |
| `data.expires_in` | `integer` | No | Positive lifetime in seconds from deployment settings; example 3600 is not policy. |
| `data.user` | `object` | No | Authenticated account; expanded below, never includes a password/hash. |
| `data.user.id` | `ID` | No | Account identifier. |
| `data.user.username` | `string` | No | Login name; 1–50 characters. |
| `data.user.display_name` | `string` | No | Display name; 1–100 characters. |
| `data.user.role` | `string` | No | ADMIN or USER; server-authorized role. |
| `data.user.status` | `string` | No | ACTIVE or DISABLED; protected requests require ACTIVE. |
| `data.user.created_at` | `Timestamp` | No | Account creation time. |
| `data.user.updated_at` | `Timestamp` | No | Account last-update time. |

**Complete success example**

```json
{
  "data": {
    "access_token": "<access-token>",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "21",
      "username": "demo_voter",
      "display_name": "Demo Voter",
      "role": "USER",
      "status": "ACTIVE",
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-01T01:00:00Z"
    }
  }
}
```

expires_in=3600 is illustrative only, not an approved token-lifetime policy.

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `INVALID_CREDENTIALS` | Generic login failure, including disabled accounts. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

Error responses also use Cache-Control: no-store.

**Example: HTTP 401**

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Generic login failure, including disabled accounts."
  }
}
```

#### Business rules and retry behavior

- Request: Login; no query. Success: 200 Token.
- Check password and account status. Unknown user, wrong password and disabled account all return `401 INVALID_CREDENTIALS` to avoid account enumeration.
- JWT lifetime/signing configuration comes from the environment, not hard-coded examples. Hashing and frontend token storage remain undecided. No registration, refresh or server logout operation is introduced.

[Back to operation index](#api-index)

---

<a id="endpoint-2"></a>

### 4.2 Current identity

Read the identity associated with the current access token.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/auth/me` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | Authenticated |
| Election state | Not election-specific. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

None.

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/auth/me HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `User` response is fully expanded below; all fields are present, with null only where declared.

`Cache-Control: no-store`

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Account identifier. |
| `data.username` | `string` | No | Login name; 1–50 characters. |
| `data.display_name` | `string` | No | Display name; 1–100 characters. |
| `data.role` | `string` | No | ADMIN or USER; server-authorized role. |
| `data.status` | `string` | No | ACTIVE or DISABLED; protected requests require ACTIVE. |
| `data.created_at` | `Timestamp` | No | Account creation time. |
| `data.updated_at` | `Timestamp` | No | Account last-update time. |

**Complete success example**

```json
{
  "data": {
    "id": "21",
    "username": "demo_voter",
    "display_name": "Demo Voter",
    "role": "USER",
    "status": "ACTIVE",
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-01T01:00:00Z"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

Error responses also use Cache-Control: no-store.

**Example: HTTP 401**

```json
{
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Missing/invalid/expired identity or account no longer ACTIVE."
  }
}
```

#### Business rules and retry behavior

- No body/query. Success: 200 User.
- Resolve the account from a verified JWT. A subsequently disabled account returns `401 AUTHENTICATION_REQUIRED` even if the token has not expired.
- Do not accept a user_id selector for another account.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-3"></a>

### 4.3 Election list

List elections the caller is allowed to see.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/elections` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | Authenticated |
| Election state | Any visible state; optional status filter. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

None.

**Query parameters**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | `integer` | No | 1 | Positive-integer query string; minimum 1. |
| `page_size` | `integer` | No | 20 | Positive-integer query string, 1–100. |
| `status` | `string` | No | — | DRAFT / OPEN / CLOSED; omitted means no status filter. |

Filter visibility before totals and pagination. Beyond the last page return data: [] with the true total; reject unknown query fields with 422.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/elections?page=1&page_size=20 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Election[]` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object[]` | No | Success payload. |
| `data[].id` | `ID` | No | Election identifier. |
| `data[].title` | `string` | No | Election name; 1–200 nonblank characters. |
| `data[].position_title` | `string` | No | Single contested position; 1–100 nonblank characters. |
| `data[].description` | `string` | Yes | Optional description; at most 10000 characters. |
| `data[].created_by` | `ID` | No | Creator taken from the authenticated ADMIN, not client input. |
| `data[].status` | `string` | No | DRAFT, OPEN or CLOSED; there is no PUBLISHED state. |
| `data[].privacy_mode` | `string` | No | FORCED_ANONYMOUS only in v1. |
| `data[].starts_at` | `Timestamp` | No | Voting start; must precede ends_at. |
| `data[].ends_at` | `Timestamp` | No | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `data[].results_published_at` | `Timestamp` | Yes | null before publication; otherwise server publication time. |
| `data[].created_at` | `Timestamp` | No | Election creation time. |
| `data[].updated_at` | `Timestamp` | No | Election last-update time. |
| `meta` | `object` | No | Pagination after visibility filtering. |
| `meta.page` | `integer` | No | Current page, minimum 1. |
| `meta.page_size` | `integer` | No | Page size, 1–100. |
| `meta.total` | `integer` | No | Total visible records, nonnegative; retained on out-of-range pages. |

**Complete success example**

```json
{
  "data": [
    {
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
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 1
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 422**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH."
  }
}
```

#### Business rules and retry behavior

- Query: page, page_size, optional status (DRAFT / OPEN / CLOSED); no body.
- ADMIN sees all; USER sees own roster elections and all published elections. Sort by numeric id descending; filter visibility before pagination.
- Success: 200 Election[] + meta; empty collection is data=[] and total=0. No live counts, other voters or unpublished results.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-4"></a>

### 4.4 Create election

Create a draft election and its initial eligible voter roster in one transaction.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/elections` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | Creates DRAFT. |
| Success status | 201 |
| Request format | HTTPS; JSON body with Content-Type: application/json. |

#### Request parameters

**Path parameters**

None.

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body** — `ElectionCreate`

| Field | Type | Required | Nullable | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `title` | `string` | Yes | No | — | Election name; 1–200 nonblank characters. |
| `position_title` | `string` | Yes | No | — | Single contested position; 1–100 nonblank characters. |
| `description` | `string` | No | Yes | `null` | Optional description; at most 10000 characters. |
| `starts_at` | `Timestamp` | Yes | No | — | Voting start; must precede ends_at. |
| `ends_at` | `Timestamp` | Yes | No | — | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `privacy_mode` | `string` | No | No | `FORCED_ANONYMOUS` | FORCED_ANONYMOUS only in v1. |
| `voter_ids` | `ID[]` | Yes | No | — | Nonempty unique IDs of existing ACTIVE USER accounts. Initial membership is created atomically; no new DB column. |

Only the fields above are writable. Unknown/read-only fields or wrong JSON types return 422 VALIDATION_ERROR; JSON integers do not accept booleans, fractions or strings.

Validate starts_at < ends_at using the final merged values. OPTIONAL_ANONYMOUS / IDENTIFIED return 400 PRIVACY_MODE_VIOLATION; unknown modes return 422.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/elections HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "title": "Class Representative Election",
  "position_title": "Class Representative",
  "description": "One seat; one choice per voter.",
  "starts_at": "2026-10-02T02:00:00Z",
  "ends_at": "2026-10-02T04:00:00Z",
  "voter_ids": [
    "21",
    "22"
  ]
}
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 201** · Content-Type: application/json. The `Election` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Election identifier. |
| `data.title` | `string` | No | Election name; 1–200 nonblank characters. |
| `data.position_title` | `string` | No | Single contested position; 1–100 nonblank characters. |
| `data.description` | `string` | Yes | Optional description; at most 10000 characters. |
| `data.created_by` | `ID` | No | Creator taken from the authenticated ADMIN, not client input. |
| `data.status` | `string` | No | DRAFT, OPEN or CLOSED; there is no PUBLISHED state. |
| `data.privacy_mode` | `string` | No | FORCED_ANONYMOUS only in v1. |
| `data.starts_at` | `Timestamp` | No | Voting start; must precede ends_at. |
| `data.ends_at` | `Timestamp` | No | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `data.results_published_at` | `Timestamp` | Yes | null before publication; otherwise server publication time. |
| `data.created_at` | `Timestamp` | No | Election creation time. |
| `data.updated_at` | `Timestamp` | No | Election last-update time. |

**Complete success example**

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

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 400 | `PRIVACY_MODE_VIOLATION` | Request enables a recognized but forbidden v1 mode. |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `USER_NOT_FOUND` | ADMIN-specified roster account does not exist. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 422 | `INVALID_TIME_RANGE` | Merged starts_at does not precede ends_at. |
| 422 | `INVALID_VOTER` | Existing account is not ACTIVE or not USER. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 422**

```json
{
  "error": {
    "code": "INVALID_TIME_RANGE",
    "message": "Merged starts_at does not precede ends_at."
  }
}
```

#### Business rules and retry behavior

- ADMIN; request ElectionCreate; success 201 Election in DRAFT.
- starts_at must precede ends_at. voter_ids must be unique existing ACTIVE USER accounts; obtain IDs through authorized seed/deployment data.
- Create election and initial memberships atomically, with quota 1; roll back everything if any account is invalid. Derive created_by from the current ADMIN. Add candidates afterwards.
- Errors: `USER_NOT_FOUND`, `INVALID_VOTER`, `INVALID_TIME_RANGE`, `PRIVACY_MODE_VIOLATION`; duplicate voter_ids is `VALIDATION_ERROR`.

- Election/candidate creation does not promise strict idempotency; query after a timeout before creating duplicates. Duplicate membership returns 409. Repeated deletion may return 404 but cannot cause a second effect.

[Back to operation index](#api-index)

---

<a id="endpoint-5"></a>

### 4.5 Election detail

Read one election without exposing its roster or vote counts.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/elections/{election_id}` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | Authenticated, visible scope |
| Election state | Any visible state. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/elections/1001 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Election` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Election identifier. |
| `data.title` | `string` | No | Election name; 1–200 nonblank characters. |
| `data.position_title` | `string` | No | Single contested position; 1–100 nonblank characters. |
| `data.description` | `string` | Yes | Optional description; at most 10000 characters. |
| `data.created_by` | `ID` | No | Creator taken from the authenticated ADMIN, not client input. |
| `data.status` | `string` | No | DRAFT, OPEN or CLOSED; there is no PUBLISHED state. |
| `data.privacy_mode` | `string` | No | FORCED_ANONYMOUS only in v1. |
| `data.starts_at` | `Timestamp` | No | Voting start; must precede ends_at. |
| `data.ends_at` | `Timestamp` | No | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `data.results_published_at` | `Timestamp` | Yes | null before publication; otherwise server publication time. |
| `data.created_at` | `Timestamp` | No | Election creation time. |
| `data.updated_at` | `Timestamp` | No | Election last-update time. |

**Complete success example**

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

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 404**

```json
{
  "error": {
    "code": "ELECTION_NOT_FOUND",
    "message": "Election absent, or detail outside visibility."
  }
}
```

#### Business rules and retry behavior

- No body/query; success 200 Election. Same visibility as the list.
- Absent or invisible elections return `404 ELECTION_NOT_FOUND`. Do not include candidates, other voters or vote counts.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-6"></a>

### 4.6 Update draft election

Update selected draft election fields while preserving omitted values.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `PATCH` |
| Full path | `/api/v1/elections/{election_id}` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | DRAFT only. |
| Success status | 200 |
| Request format | HTTPS; JSON body with Content-Type: application/json. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body** — `ElectionPatch`

| Field | Type | Required | Nullable | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `title` | `string` | No | No | `Unchanged` | Election name; 1–200 nonblank characters. |
| `position_title` | `string` | No | No | `Unchanged` | Single contested position; 1–100 nonblank characters. |
| `description` | `string` | No | Yes | `Unchanged` | Optional description; at most 10000 characters. |
| `starts_at` | `Timestamp` | No | No | `Unchanged` | Voting start; must precede ends_at. |
| `ends_at` | `Timestamp` | No | No | `Unchanged` | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `privacy_mode` | `string` | No | No | `Unchanged` | FORCED_ANONYMOUS only in v1. |

Submit at least one listed field. Omitted fields remain unchanged; null only clears declared nullable fields. An empty object returns 422 VALIDATION_ERROR.

Only the fields above are writable. Unknown/read-only fields or wrong JSON types return 422 VALIDATION_ERROR; JSON integers do not accept booleans, fractions or strings.

Validate starts_at < ends_at using the final merged values. OPTIONAL_ANONYMOUS / IDENTIFIED return 400 PRIVACY_MODE_VIOLATION; unknown modes return 422.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
PATCH /api/v1/elections/1001 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "description": "Updated election description."
}
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Election` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Election identifier. |
| `data.title` | `string` | No | Election name; 1–200 nonblank characters. |
| `data.position_title` | `string` | No | Single contested position; 1–100 nonblank characters. |
| `data.description` | `string` | Yes | Optional description; at most 10000 characters. |
| `data.created_by` | `ID` | No | Creator taken from the authenticated ADMIN, not client input. |
| `data.status` | `string` | No | DRAFT, OPEN or CLOSED; there is no PUBLISHED state. |
| `data.privacy_mode` | `string` | No | FORCED_ANONYMOUS only in v1. |
| `data.starts_at` | `Timestamp` | No | Voting start; must precede ends_at. |
| `data.ends_at` | `Timestamp` | No | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `data.results_published_at` | `Timestamp` | Yes | null before publication; otherwise server publication time. |
| `data.created_at` | `Timestamp` | No | Election creation time. |
| `data.updated_at` | `Timestamp` | No | Election last-update time. |

**Complete success example**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "Updated election description.",
    "created_by": "11",
    "status": "DRAFT",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-01T01:05:00Z"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 400 | `PRIVACY_MODE_VIOLATION` | Request enables a recognized but forbidden v1 mode. |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `ELECTION_NOT_EDITABLE` | Mutation requires DRAFT. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 422 | `INVALID_TIME_RANGE` | Merged starts_at does not precede ends_at. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "ELECTION_NOT_EDITABLE",
    "message": "Mutation requires DRAFT."
  }
}
```

#### Business rules and retry behavior

- ADMIN; DRAFT only; request ElectionPatch; success 200 Election.
- Validate the merged time range. Reject id, created_by, status, results_published_at and voter_ids; use membership operations to change eligibility.
- A DRAFT update racing with open must not commit after the election becomes OPEN.
- Errors: `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`, `INVALID_TIME_RANGE`, `PRIVACY_MODE_VIOLATION`.

[Back to operation index](#api-index)

---

<a id="endpoint-7"></a>

### 4.7 Open voting

Move a ready election from DRAFT to OPEN within its scheduled window.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/elections/{election_id}/open` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | DRAFT → OPEN; starts_at <= server_now <= ends_at. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/elections/1001/open HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Election` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Election identifier. |
| `data.title` | `string` | No | Election name; 1–200 nonblank characters. |
| `data.position_title` | `string` | No | Single contested position; 1–100 nonblank characters. |
| `data.description` | `string` | Yes | Optional description; at most 10000 characters. |
| `data.created_by` | `ID` | No | Creator taken from the authenticated ADMIN, not client input. |
| `data.status` | `string` | No | DRAFT, OPEN or CLOSED; there is no PUBLISHED state. |
| `data.privacy_mode` | `string` | No | FORCED_ANONYMOUS only in v1. |
| `data.starts_at` | `Timestamp` | No | Voting start; must precede ends_at. |
| `data.ends_at` | `Timestamp` | No | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `data.results_published_at` | `Timestamp` | Yes | null before publication; otherwise server publication time. |
| `data.created_at` | `Timestamp` | No | Election creation time. |
| `data.updated_at` | `Timestamp` | No | Election last-update time. |

**Complete success example**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "One seat; one choice per voter.",
    "created_by": "11",
    "status": "OPEN",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-02T02:00:00Z"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `INVALID_STATE_TRANSITION` | Invalid or repeated open/close. |
| 409 | `ELECTION_NOT_READY` | No valid candidate/active voter, or invalid MVP configuration. |
| 409 | `VOTING_NOT_STARTED` | Server time is before starts_at. |
| 409 | `VOTING_ENDED` | Server time is after ends_at. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "VOTING_NOT_STARTED",
    "message": "Server time is before starts_at."
  }
}
```

#### Business rules and retry behavior

- ADMIN; no body/query; only DRAFT → OPEN; success 200 Election.
- Require the inclusive time window, at least one candidate with every candidate valid, and one ACTIVE USER member; every quota is 1 and privacy_mode is FORCED_ANONYMOUS.
- Atomically validate and transition. Repeated open or reopening CLOSED returns `INVALID_STATE_TRANSITION`. No scheduler is introduced.
- Errors: `ELECTION_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `ELECTION_NOT_READY`, `VOTING_NOT_STARTED`, `VOTING_ENDED`.

- Repeated open/close returns 409; GET the election to reconcile. Repeated publication returns the original timestamp without overwriting it.

[Back to operation index](#api-index)

---

<a id="endpoint-8"></a>

### 4.8 Close voting

Stop voting and make the election available for final counting.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/elections/{election_id}/close` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | OPEN → CLOSED; early and post-deadline closing allowed. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/elections/1001/close HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Election` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Election identifier. |
| `data.title` | `string` | No | Election name; 1–200 nonblank characters. |
| `data.position_title` | `string` | No | Single contested position; 1–100 nonblank characters. |
| `data.description` | `string` | Yes | Optional description; at most 10000 characters. |
| `data.created_by` | `ID` | No | Creator taken from the authenticated ADMIN, not client input. |
| `data.status` | `string` | No | DRAFT, OPEN or CLOSED; there is no PUBLISHED state. |
| `data.privacy_mode` | `string` | No | FORCED_ANONYMOUS only in v1. |
| `data.starts_at` | `Timestamp` | No | Voting start; must precede ends_at. |
| `data.ends_at` | `Timestamp` | No | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `data.results_published_at` | `Timestamp` | Yes | null before publication; otherwise server publication time. |
| `data.created_at` | `Timestamp` | No | Election creation time. |
| `data.updated_at` | `Timestamp` | No | Election last-update time. |

**Complete success example**

```json
{
  "data": {
    "id": "1001",
    "title": "Class Representative Election",
    "position_title": "Class Representative",
    "description": "One seat; one choice per voter.",
    "created_by": "11",
    "status": "CLOSED",
    "privacy_mode": "FORCED_ANONYMOUS",
    "starts_at": "2026-10-02T02:00:00Z",
    "ends_at": "2026-10-02T04:00:00Z",
    "results_published_at": null,
    "created_at": "2026-10-01T01:00:00Z",
    "updated_at": "2026-10-02T04:00:00Z"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `INVALID_STATE_TRANSITION` | Invalid or repeated open/close. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Invalid or repeated open/close."
  }
}
```

#### Business rules and retry behavior

- ADMIN; no body/query; only OPEN → CLOSED; success 200 Election.
- Early close and close after ends_at are allowed, enabling counting/publication. Repeated close returns `INVALID_STATE_TRANSITION`.
- Take the exclusive election lock, wait for in-flight voting, commit CLOSED, then return success. Even if stored state remains OPEN, elapsed elections must reject votes.
- Errors: `ELECTION_NOT_FOUND`, `INVALID_STATE_TRANSITION`.

- Repeated open/close returns 409; GET the election to reconcile. Repeated publication returns the original timestamp without overwriting it.

[Back to operation index](#api-index)

---

<a id="endpoint-9"></a>

### 4.9 Candidate list

Read a paginated candidate list subject to role and voting access checks.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/elections/{election_id}/candidates` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN / eligible USER |
| Election state | ADMIN: any; USER: OPEN within the inclusive window. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | `integer` | No | 1 | Positive-integer query string; minimum 1. |
| `page_size` | `integer` | No | 20 | Positive-integer query string, 1–100. |

Filter visibility before totals and pagination. Beyond the last page return data: [] with the true total; reject unknown query fields with 422.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/elections/1001/candidates?page=1&page_size=20 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Candidate[]` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object[]` | No | Success payload. |
| `data[].id` | `ID` | No | Candidate identifier, scoped to its election. |
| `data[].election_id` | `ID` | No | Owning election. |
| `data[].name` | `string` | No | 1–100 nonblank characters; duplicate names allowed. |
| `data[].position_title` | `string` | No | Read-only; derived from Election.position_title, not a separate stored position. |
| `data[].description` | `string` | No | Required introduction; 1–10000 nonblank characters. |
| `data[].photo_url` | `string` | Yes | Optional HTTPS URL, at most 500 characters; no upload or server-side fetch. |
| `data[].display_order` | `integer` | No | 0–2147483647; default 0. Order ascending, then numeric candidate id. |
| `data[].created_at` | `Timestamp` | No | Candidate creation time. |
| `data[].updated_at` | `Timestamp` | No | Candidate last-update time. |
| `meta` | `object` | No | Pagination after visibility filtering. |
| `meta.page` | `integer` | No | Current page, minimum 1. |
| `meta.page_size` | `integer` | No | Page size, 1–100. |
| `meta.total` | `integer` | No | Total visible records, nonnegative; retained on out-of-range pages. |

**Complete success example**

```json
{
  "data": [
    {
      "id": "101",
      "election_id": "1001",
      "name": "Candidate A",
      "description": "A fictional introduction.",
      "photo_url": null,
      "display_order": 0,
      "position_title": "Class Representative",
      "created_at": "2026-10-01T01:10:00Z",
      "updated_at": "2026-10-01T01:10:00Z"
    },
    {
      "id": "102",
      "election_id": "1001",
      "name": "Candidate B",
      "description": "A fictional introduction.",
      "photo_url": null,
      "display_order": 1,
      "position_title": "Class Representative",
      "created_at": "2026-10-01T01:10:00Z",
      "updated_at": "2026-10-01T01:10:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 2
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 403 | `NOT_ELIGIBLE` | Non-member attempts ballot/candidate viewing or voting. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `ELECTION_NOT_OPEN` | Ballot viewing/voting requires OPEN. |
| 409 | `VOTING_NOT_STARTED` | Server time is before starts_at. |
| 409 | `VOTING_ENDED` | Server time is after ends_at. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 403**

```json
{
  "error": {
    "code": "NOT_ELIGIBLE",
    "message": "Non-member attempts ballot/candidate viewing or voting."
  }
}
```

#### Business rules and retry behavior

- Query: page, page_size; no body; success 200 Candidate[] + meta. Sort by display_order, then numeric id ascending.
- ADMIN may read in any state. USER needs membership, OPEN and the voting time window, matching ballot access so this operation cannot bypass FR-07 / FR-08.
- Eligible users who already voted may read, without their previous choice. After closing, ordinary users read published results instead.
- Errors: `ELECTION_NOT_FOUND`, `NOT_ELIGIBLE`, `ELECTION_NOT_OPEN`, `VOTING_NOT_STARTED`, `VOTING_ENDED`.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-10"></a>

### 4.10 Add candidate

Add a candidate to a draft election, inheriting its single contested position.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/elections/{election_id}/candidates` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | DRAFT only. |
| Success status | 201 |
| Request format | HTTPS; JSON body with Content-Type: application/json. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body** — `CandidateCreate`

| Field | Type | Required | Nullable | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `name` | `string` | Yes | No | — | 1–100 nonblank characters; duplicate names allowed. |
| `description` | `string` | Yes | No | — | Required introduction; 1–10000 nonblank characters. |
| `photo_url` | `string` | No | Yes | `null` | Optional HTTPS URL, at most 500 characters; no upload or server-side fetch. |
| `display_order` | `integer` | No | No | `0` | 0–2147483647; default 0. Order ascending, then numeric candidate id. |

Only the fields above are writable. Unknown/read-only fields or wrong JSON types return 422 VALIDATION_ERROR; JSON integers do not accept booleans, fractions or strings.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/elections/1001/candidates HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "name": "Candidate A",
  "description": "A fictional introduction.",
  "photo_url": null,
  "display_order": 0
}
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 201** · Content-Type: application/json. The `Candidate` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Candidate identifier, scoped to its election. |
| `data.election_id` | `ID` | No | Owning election. |
| `data.name` | `string` | No | 1–100 nonblank characters; duplicate names allowed. |
| `data.position_title` | `string` | No | Read-only; derived from Election.position_title, not a separate stored position. |
| `data.description` | `string` | No | Required introduction; 1–10000 nonblank characters. |
| `data.photo_url` | `string` | Yes | Optional HTTPS URL, at most 500 characters; no upload or server-side fetch. |
| `data.display_order` | `integer` | No | 0–2147483647; default 0. Order ascending, then numeric candidate id. |
| `data.created_at` | `Timestamp` | No | Candidate creation time. |
| `data.updated_at` | `Timestamp` | No | Candidate last-update time. |

**Complete success example**

```json
{
  "data": {
    "id": "101",
    "election_id": "1001",
    "name": "Candidate A",
    "description": "A fictional introduction.",
    "photo_url": null,
    "display_order": 0,
    "position_title": "Class Representative",
    "created_at": "2026-10-01T01:10:00Z",
    "updated_at": "2026-10-01T01:10:00Z"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `ELECTION_NOT_EDITABLE` | Mutation requires DRAFT. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "ELECTION_NOT_EDITABLE",
    "message": "Mutation requires DRAFT."
  }
}
```

#### Business rules and retry behavior

- ADMIN; DRAFT only; request CandidateCreate; success 201 Candidate.
- election_id comes from the path and position_title from the election; neither is writable in the body. No candidate account or name deduplication is required.
- Errors: `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

- Election/candidate creation does not promise strict idempotency; query after a timeout before creating duplicates. Duplicate membership returns 409. Repeated deletion may return 404 but cannot cause a second effect.

[Back to operation index](#api-index)

---

<a id="endpoint-11"></a>

### 4.11 Update candidate

Update selected fields of a candidate belonging to this draft election.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `PATCH` |
| Full path | `/api/v1/elections/{election_id}/candidates/{candidate_id}` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | DRAFT only. |
| Success status | 200 |
| Request format | HTTPS; JSON body with Content-Type: application/json. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |
| `candidate_id` | `ID` | Yes | Candidate belonging to this election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body** — `CandidatePatch`

| Field | Type | Required | Nullable | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `name` | `string` | No | No | `Unchanged` | 1–100 nonblank characters; duplicate names allowed. |
| `description` | `string` | No | No | `Unchanged` | Required introduction; 1–10000 nonblank characters. |
| `photo_url` | `string` | No | Yes | `Unchanged` | Optional HTTPS URL, at most 500 characters; no upload or server-side fetch. |
| `display_order` | `integer` | No | No | `Unchanged` | 0–2147483647; default 0. Order ascending, then numeric candidate id. |

Submit at least one listed field. Omitted fields remain unchanged; null only clears declared nullable fields. An empty object returns 422 VALIDATION_ERROR.

Only the fields above are writable. Unknown/read-only fields or wrong JSON types return 422 VALIDATION_ERROR; JSON integers do not accept booleans, fractions or strings.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
PATCH /api/v1/elections/1001/candidates/101 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "description": "Updated candidate introduction."
}
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Candidate` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.id` | `ID` | No | Candidate identifier, scoped to its election. |
| `data.election_id` | `ID` | No | Owning election. |
| `data.name` | `string` | No | 1–100 nonblank characters; duplicate names allowed. |
| `data.position_title` | `string` | No | Read-only; derived from Election.position_title, not a separate stored position. |
| `data.description` | `string` | No | Required introduction; 1–10000 nonblank characters. |
| `data.photo_url` | `string` | Yes | Optional HTTPS URL, at most 500 characters; no upload or server-side fetch. |
| `data.display_order` | `integer` | No | 0–2147483647; default 0. Order ascending, then numeric candidate id. |
| `data.created_at` | `Timestamp` | No | Candidate creation time. |
| `data.updated_at` | `Timestamp` | No | Candidate last-update time. |

**Complete success example**

```json
{
  "data": {
    "id": "101",
    "election_id": "1001",
    "name": "Candidate A",
    "description": "Updated candidate introduction.",
    "photo_url": null,
    "display_order": 0,
    "position_title": "Class Representative",
    "created_at": "2026-10-01T01:10:00Z",
    "updated_at": "2026-10-01T01:15:00Z"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 404 | `CANDIDATE_NOT_FOUND` | Candidate-management target absent or cross-election. |
| 409 | `ELECTION_NOT_EDITABLE` | Mutation requires DRAFT. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 404**

```json
{
  "error": {
    "code": "CANDIDATE_NOT_FOUND",
    "message": "Candidate-management target absent or cross-election."
  }
}
```

#### Business rules and retry behavior

- ADMIN; DRAFT only; request CandidatePatch; success 200 Candidate.
- Check candidate_id within the path election, not a global ID-only update; no election transfer or independent position edit.
- Errors: `ELECTION_NOT_FOUND`, `CANDIDATE_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

[Back to operation index](#api-index)

---

<a id="endpoint-12"></a>

### 4.12 Delete draft candidate

Delete an unreferenced candidate from a draft election.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `DELETE` |
| Full path | `/api/v1/elections/{election_id}/candidates/{candidate_id}` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | DRAFT only. |
| Success status | 204 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |
| `candidate_id` | `ID` | Yes | Candidate belonging to this election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
DELETE /api/v1/elections/1001/candidates/101 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**204 No Content.** No fields, no JSON and no data wrapper.

```http
HTTP/1.1 204 No Content
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 404 | `CANDIDATE_NOT_FOUND` | Candidate-management target absent or cross-election. |
| 409 | `ELECTION_NOT_EDITABLE` | Mutation requires DRAFT. |
| 409 | `RESOURCE_CONFLICT` | Existing reference/immutable record prevents safe mutation. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "RESOURCE_CONFLICT",
    "message": "Existing reference/immutable record prevents safe mutation."
  }
}
```

#### Business rules and retry behavior

- ADMIN; DRAFT only; no body/query; success 204 without a body.
- Candidate must belong to this election and have no ballot reference. Never cascade-delete ballots; an existing reference returns `RESOURCE_CONFLICT`.
- Missing, cross-election or already-deleted candidate returns `CANDIDATE_NOT_FOUND`; also `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

- Election/candidate creation does not promise strict idempotency; query after a timeout before creating duplicates. Duplicate membership returns 409. Repeated deletion may return 404 but cannot cause a second effect.

[Back to operation index](#api-index)

---

<a id="endpoint-13"></a>

### 4.13 Voter roll

Let an administrator inspect roster metadata without individual voting history.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/elections/{election_id}/voters` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | Any state. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | `integer` | No | 1 | Positive-integer query string; minimum 1. |
| `page_size` | `integer` | No | 20 | Positive-integer query string, 1–100. |

Filter visibility before totals and pagination. Beyond the last page return data: [] with the true total; reject unknown query fields with 422.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/elections/1001/voters?page=1&page_size=20 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Voter[]` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object[]` | No | Success payload. |
| `data[].election_id` | `ID` | No | Election part of the composite membership key. |
| `data[].user_id` | `ID` | No | Account part of the composite membership key; no separate row ID. |
| `data[].display_name` | `string` | No | Display name from the existing account; 1–100 characters. |
| `data[].vote_quota` | `integer` | No | Exactly 1 in v1. |
| `data[].created_at` | `Timestamp` | No | Membership creation time, not voting time. |
| `data[].updated_at` | `Timestamp` | No | Membership last-update time, not voting time. |
| `meta` | `object` | No | Pagination after visibility filtering. |
| `meta.page` | `integer` | No | Current page, minimum 1. |
| `meta.page_size` | `integer` | No | Page size, 1–100. |
| `meta.total` | `integer` | No | Total visible records, nonnegative; retained on out-of-range pages. |

**Complete success example**

```json
{
  "data": [
    {
      "election_id": "1001",
      "user_id": "21",
      "display_name": "Demo Voter",
      "vote_quota": 1,
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-01T01:00:00Z"
    },
    {
      "election_id": "1001",
      "user_id": "22",
      "display_name": "Demo Voter 2",
      "vote_quota": 1,
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-01T01:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 2
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 403**

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Authenticated caller has the wrong role."
  }
}
```

#### Business rules and retry behavior

- ADMIN; any election state; query page, page_size; no body; success 200 Voter[] + meta.
- Sort by numeric user_id ascending. Return membership metadata only, not ballot IDs, choices, voting timestamps or personal voting history.
- USER cannot list other voters. Errors: `ELECTION_NOT_FOUND`, `PERMISSION_DENIED`.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-14"></a>

### 4.14 Add voter

Add one existing active voter account to a draft election.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/elections/{election_id}/voters` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | DRAFT only. |
| Success status | 201 |
| Request format | HTTPS; JSON body with Content-Type: application/json. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body** — `VoterCreate`

| Field | Type | Required | Nullable | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `ID` | Yes | No | — | Existing ACTIVE USER account being added, not the caller identity. |
| `vote_quota` | `integer` | No | No | `1` | Exactly 1 in v1. |

Only the fields above are writable. Unknown/read-only fields or wrong JSON types return 422 VALIDATION_ERROR; JSON integers do not accept booleans, fractions or strings.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/elections/1001/voters HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "user_id": "23",
  "vote_quota": 1
}
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 201** · Content-Type: application/json. The `Voter` response is fully expanded below; all fields are present, with null only where declared.

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.election_id` | `ID` | No | Election part of the composite membership key. |
| `data.user_id` | `ID` | No | Account part of the composite membership key; no separate row ID. |
| `data.display_name` | `string` | No | Display name from the existing account; 1–100 characters. |
| `data.vote_quota` | `integer` | No | Exactly 1 in v1. |
| `data.created_at` | `Timestamp` | No | Membership creation time, not voting time. |
| `data.updated_at` | `Timestamp` | No | Membership last-update time, not voting time. |

**Complete success example**

```json
{
  "data": {
    "election_id": "1001",
    "user_id": "23",
    "display_name": "Demo Voter 3",
    "vote_quota": 1,
    "created_at": "2026-10-01T01:20:00Z",
    "updated_at": "2026-10-01T01:20:00Z"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 404 | `USER_NOT_FOUND` | ADMIN-specified roster account does not exist. |
| 409 | `ELECTION_NOT_EDITABLE` | Mutation requires DRAFT. |
| 409 | `VOTER_ALREADY_EXISTS` | Duplicate membership; do not create another row. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 422 | `INVALID_VOTER` | Existing account is not ACTIVE or not USER. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "VOTER_ALREADY_EXISTS",
    "message": "Duplicate membership; do not create another row."
  }
}
```

#### Business rules and retry behavior

- ADMIN; DRAFT only; request VoterCreate; success 201 Voter.
- Require an existing ACTIVE USER. Deduplicate by (election_id, user_id); duplicate membership returns `409 VOTER_ALREADY_EXISTS`, without a second row.
- No bulk import, quota editor or account creation. Quota other than 1 returns `422 VALIDATION_ERROR`.
- Other errors: `ELECTION_NOT_FOUND`, `USER_NOT_FOUND`, `INVALID_VOTER`, `ELECTION_NOT_EDITABLE`.

- Election/candidate creation does not promise strict idempotency; query after a timeout before creating duplicates. Duplicate membership returns 409. Repeated deletion may return 404 but cannot cause a second effect.

[Back to operation index](#api-index)

---

<a id="endpoint-15"></a>

### 4.15 Remove voter

Remove a draft election membership without deleting the user account.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `DELETE` |
| Full path | `/api/v1/elections/{election_id}/voters/{user_id}` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | DRAFT only. |
| Success status | 204 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |
| `user_id` | `ID` | Yes | Roster member to remove, not the caller identity. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
DELETE /api/v1/elections/1001/voters/23 HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**204 No Content.** No fields, no JSON and no data wrapper.

```http
HTTP/1.1 204 No Content
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 404 | `VOTER_NOT_FOUND` | Target membership does not exist. |
| 409 | `ELECTION_NOT_EDITABLE` | Mutation requires DRAFT. |
| 409 | `RESOURCE_CONFLICT` | Existing reference/immutable record prevents safe mutation. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

**Example: HTTP 404**

```json
{
  "error": {
    "code": "VOTER_NOT_FOUND",
    "message": "Target membership does not exist."
  }
}
```

#### Business rules and retry behavior

- ADMIN; DRAFT only; no body/query; success 204 without a body.
- Delete only membership, never accounts or participation. Existing participation returns `RESOURCE_CONFLICT`. Removing the final member in DRAFT is allowed, but opening then fails readiness checks.
- Missing or already-deleted membership returns `VOTER_NOT_FOUND`; also `ELECTION_NOT_FOUND`, `ELECTION_NOT_EDITABLE`.

- Election/candidate creation does not promise strict idempotency; query after a timeout before creating duplicates. Duplicate membership returns 409. Repeated deletion may return 404 but cannot cause a second effect.

[Back to operation index](#api-index)

---

<a id="endpoint-16"></a>

### 4.16 Ballot view

Return everything required to display the current voter's ballot page.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/elections/{election_id}/ballot` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | Eligible USER |
| Election state | OPEN; starts_at <= server_now <= ends_at. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/elections/1001/ballot HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `BallotView` response is fully expanded below; all fields are present, with null only where declared.

`Cache-Control: no-store`

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.election` | `object` | No | Current election; status must be OPEN. |
| `data.election.id` | `ID` | No | Election identifier. |
| `data.election.title` | `string` | No | Election name; 1–200 nonblank characters. |
| `data.election.position_title` | `string` | No | Single contested position; 1–100 nonblank characters. |
| `data.election.description` | `string` | Yes | Optional description; at most 10000 characters. |
| `data.election.created_by` | `ID` | No | Creator taken from the authenticated ADMIN, not client input. |
| `data.election.status` | `string` | No | DRAFT, OPEN or CLOSED; there is no PUBLISHED state. |
| `data.election.privacy_mode` | `string` | No | FORCED_ANONYMOUS only in v1. |
| `data.election.starts_at` | `Timestamp` | No | Voting start; must precede ends_at. |
| `data.election.ends_at` | `Timestamp` | No | Voting end; starts_at <= server_now <= ends_at is inclusive. |
| `data.election.results_published_at` | `Timestamp` | Yes | null before publication; otherwise server publication time. |
| `data.election.created_at` | `Timestamp` | No | Election creation time. |
| `data.election.updated_at` | `Timestamp` | No | Election last-update time. |
| `data.candidates` | `object[]` | No | All candidates, ordered by display_order then numeric id; no pagination. |
| `data.candidates[].id` | `ID` | No | Candidate identifier, scoped to its election. |
| `data.candidates[].election_id` | `ID` | No | Owning election. |
| `data.candidates[].name` | `string` | No | 1–100 nonblank characters; duplicate names allowed. |
| `data.candidates[].position_title` | `string` | No | Read-only; derived from Election.position_title, not a separate stored position. |
| `data.candidates[].description` | `string` | No | Required introduction; 1–10000 nonblank characters. |
| `data.candidates[].photo_url` | `string` | Yes | Optional HTTPS URL, at most 500 characters; no upload or server-side fetch. |
| `data.candidates[].display_order` | `integer` | No | 0–2147483647; default 0. Order ascending, then numeric candidate id. |
| `data.candidates[].created_at` | `Timestamp` | No | Candidate creation time. |
| `data.candidates[].updated_at` | `Timestamp` | No | Candidate last-update time. |
| `data.participation` | `object` | No | Caller-only state; no saved ballot or earlier selection. |
| `data.participation.election_id` | `ID` | No | Election whose caller-only participation is checked. |
| `data.participation.eligible` | `boolean` | No | Whether the ACTIVE USER is a member; not a guarantee voting is open. |
| `data.participation.vote_quota` | `integer` | No | 1 for members, 0 for non-members. |
| `data.participation.used_votes` | `integer` | No | 0 or 1 from caller participation, not ballot choice; 0 for non-members. |
| `data.participation.remaining_votes` | `integer` | No | vote_quota - used_votes, 0 or 1; 0 for non-members. |

**Complete success example**

```json
{
  "data": {
    "election": {
      "id": "1001",
      "title": "Class Representative Election",
      "position_title": "Class Representative",
      "description": "One seat; one choice per voter.",
      "created_by": "11",
      "status": "OPEN",
      "privacy_mode": "FORCED_ANONYMOUS",
      "starts_at": "2026-10-02T02:00:00Z",
      "ends_at": "2026-10-02T04:00:00Z",
      "results_published_at": null,
      "created_at": "2026-10-01T01:00:00Z",
      "updated_at": "2026-10-02T02:00:00Z"
    },
    "candidates": [
      {
        "id": "101",
        "election_id": "1001",
        "name": "Candidate A",
        "description": "A fictional introduction.",
        "photo_url": null,
        "display_order": 0,
        "position_title": "Class Representative",
        "created_at": "2026-10-01T01:10:00Z",
        "updated_at": "2026-10-01T01:10:00Z"
      },
      {
        "id": "102",
        "election_id": "1001",
        "name": "Candidate B",
        "description": "A fictional introduction.",
        "photo_url": null,
        "display_order": 1,
        "position_title": "Class Representative",
        "created_at": "2026-10-01T01:10:00Z",
        "updated_at": "2026-10-01T01:10:00Z"
      }
    ],
    "participation": {
      "election_id": "1001",
      "eligible": true,
      "vote_quota": 1,
      "used_votes": 0,
      "remaining_votes": 1
    }
  }
}
```

Candidates are unpaginated. An already-voted eligible caller can read this view with used_votes=1 and remaining_votes=0, never their earlier choice.

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 403 | `NOT_ELIGIBLE` | Non-member attempts ballot/candidate viewing or voting. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `ELECTION_NOT_OPEN` | Ballot viewing/voting requires OPEN. |
| 409 | `VOTING_NOT_STARTED` | Server time is before starts_at. |
| 409 | `VOTING_ENDED` | Server time is after ends_at. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

Error responses also use Cache-Control: no-store.

**Example: HTTP 403**

```json
{
  "error": {
    "code": "NOT_ELIGIBLE",
    "message": "Non-member attempts ballot/candidate viewing or voting."
  }
}
```

#### Business rules and retry behavior

- Eligible ACTIVE USER; no body/query; success 200 BallotView.
- Require membership, OPEN and the time window. Return all candidates ordered by display_order then numeric id, plus caller-only participation; no pagination.
- Already-voted users may read with remaining_votes=0, without their prior choice. This view neither reserves quota nor reads a saved ballot.
- Errors: `ELECTION_NOT_FOUND`, `NOT_ELIGIBLE`, `ELECTION_NOT_OPEN`, `VOTING_NOT_STARTED`, `VOTING_ENDED`. ADMIN receives `PERMISSION_DENIED`.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-17"></a>

### 4.17 Self-participation

Check only the caller's eligibility and consumed/remaining voting quota.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/elections/{election_id}/participation` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | USER |
| Election state | DRAFT / OPEN / CLOSED; publication not required. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/elections/1001/participation HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Participation` response is fully expanded below; all fields are present, with null only where declared.

`Cache-Control: no-store`

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.election_id` | `ID` | No | Election whose caller-only participation is checked. |
| `data.eligible` | `boolean` | No | Whether the ACTIVE USER is a member; not a guarantee voting is open. |
| `data.vote_quota` | `integer` | No | 1 for members, 0 for non-members. |
| `data.used_votes` | `integer` | No | 0 or 1 from caller participation, not ballot choice; 0 for non-members. |
| `data.remaining_votes` | `integer` | No | vote_quota - used_votes, 0 or 1; 0 for non-members. |

**Complete success example**

```json
{
  "data": {
    "election_id": "1001",
    "eligible": true,
    "vote_quota": 1,
    "used_votes": 1,
    "remaining_votes": 0
  }
}
```

For an existing election where the caller is not a member, return eligible=false and all three counts 0; do not disclose other users.

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

Error responses also use Cache-Control: no-store.

**Example: HTTP 404**

```json
{
  "error": {
    "code": "ELECTION_NOT_FOUND",
    "message": "Election absent, or detail outside visibility."
  }
}
```

#### Business rules and retry behavior

- ACTIVE USER; no body/query; success 200 Participation. No user_id selector for others.
- Available in DRAFT, OPEN and CLOSED, regardless of publication. Missing election is `ELECTION_NOT_FOUND`; for an existing election a non-member receives eligible=false with all counts 0.
- This is an explicit exception to election-detail visibility, explaining ineligibility without exposing a roster. ADMIN receives `PERMISSION_DENIED`.
- No user identity, candidate, ballot_id or voting timestamp. During timeout recovery, it is only a snapshot of committed state, not proof that a pending request cannot later succeed.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-18"></a>

### 4.18 Cast anonymous vote

Submit one irreversible anonymous choice and consume the single vote quota.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/elections/{election_id}/votes` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | Eligible USER |
| Election state | OPEN; starts_at <= server_now <= ends_at; remaining quota 1. |
| Success status | 201 |
| Request format | HTTPS; JSON body with Content-Type: application/json. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body** — `VoteCreate`

| Field | Type | Required | Nullable | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `candidate_id` | `ID` | Yes | No | — | Exactly one candidate belonging to this election. No identity, anonymity option or quota fields. |

Only the fields above are writable. Unknown/read-only fields or wrong JSON types return 422 VALIDATION_ERROR; JSON integers do not accept booleans, fractions or strings.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/elections/1001/votes HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "candidate_id": "101"
}
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 201** · Content-Type: application/json. The `VoteAccepted` response is fully expanded below; all fields are present, with null only where declared.

`Cache-Control: no-store`

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.election_id` | `ID` | No | Election that accepted the vote. |
| `data.accepted` | `boolean` | No | Always true; not proof of any particular candidate choice. |

**Complete success example**

```json
{
  "data": {
    "election_id": "1001",
    "accepted": true
  }
}
```

No ballot ID, candidate echo, receipt URL, submission time or ballot Location header. accepted=true is not a receipt for a particular choice.

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 400 | `INVALID_CANDIDATE` | Submitted candidate is absent or belongs to another election. |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 403 | `NOT_ELIGIBLE` | Non-member attempts ballot/candidate viewing or voting. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `ELECTION_NOT_OPEN` | Ballot viewing/voting requires OPEN. |
| 409 | `VOTING_NOT_STARTED` | Server time is before starts_at. |
| 409 | `VOTING_ENDED` | Server time is after ends_at. |
| 409 | `VOTE_QUOTA_EXHAUSTED` | Caller has consumed the single vote quota. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

Error responses also use Cache-Control: no-store.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "VOTE_QUOTA_EXHAUSTED",
    "message": "No remaining vote quota."
  }
}
```

#### Business rules and retry behavior

- Eligible ACTIVE USER; request VoteCreate; success 201 VoteAccepted. ADMIN cannot vote.
- Recheck membership, OPEN, time and remaining quota inside the transaction. Missing or cross-election candidate_id returns the same `400 INVALID_CANDIDATE`.
- Atomically write participation + anonymous ballot + choice, without incrementing result totals. A concurrent second request cannot overwrite the first ballot.
- Return success only after commit. No candidate echo, ballot ID, receipt URL, submission time or Location identifying a saved ballot. No saved-vote read/update/delete operation exists.
- Errors: `ELECTION_NOT_FOUND`, `NOT_ELIGIBLE`, `ELECTION_NOT_OPEN`, `VOTING_NOT_STARTED`, `VOTING_ENDED`, `VOTE_QUOTA_EXHAUSTED`, `INVALID_CANDIDATE`. Timeout recovery is repeated below.

**Timeout handling — do not blindly retry**

- A vote timeout, disconnect or 500 does not prove failure; the transaction may have committed before the response was lost. Do not automatically resubmit.
- Query self-participation with bounded polling: used_votes=1 confirms quota use, not the choice; never guess and display a candidate.
- used_votes=0 does not prove a pending request cannot later succeed. Keep the result uncertain; do not automatically vote again. If a user explicitly retries later, the quota/transaction checks still allow at most one ballot.
- `VOTE_QUOTA_EXHAUSTED` is a 409 failure, not replayed success; never return the original ballot.
- Polling/retries need finite timeouts and attempt limits; exact durations belong to implementation configuration, not invented performance guarantees.

**Transaction and privacy requirements**

Reuse architecture section 4.12 and ADR-007:

1. Lock in the order elections → election_voters.
2. Voting takes a shared election lock, rechecks state and server time in the transaction, then exclusively locks the current roster row and recounts used_votes.
3. Write vote_participation, ballots and ballot_choices in one transaction; roll back all writes on any failure; do not return success before commit.
4. v1 requires ballots.voter_id=NULL; participation has no ballot_id and ballots have no participation ID.
5. close takes the exclusive election lock and waits for in-flight votes; after close commits, no new ballot may be written. DRAFT edits/open also coordinate so a DRAFT check cannot commit after opening.
6. Count candidate votes from ballot_choices, not participation, and do not increment result totals during vote writes.

Preventing quota races is not strict HTTP response replay. v1 has no Idempotency-Key or deduplication table; a future deduplication mechanism must not link identity to ballot/candidate.

- No role can retrieve a saved individual ballot or reverse-resolve its voter.
- Do not log vote bodies, JWTs, passwords or full Authorization headers, especially user_id + candidate_id or user_id + ballot_id. Proxies, APM, error tracking and audit logging follow the same rule.
- Validation errors expose only field paths and static reasons; never echo vote input. Correlation IDs must not enter ballot storage or become identity-to-ballot indexes.
- The architecture provides **direct identity unlinking**, not cryptographic anonymity or resistance to timestamp/insertion-order correlation. Review the gap against the stronger FR-11/NFR-2 wording; do not claim it is resolved.
- CORS allowlists, token storage, rate limiting and deployment gates remain implementation decisions. This document changes no environment or permission.

[Back to operation index](#api-index)

---

<a id="endpoint-19"></a>

### 4.19 Count and read results

Recount a closed election or read its published result, depending on role.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `GET` |
| Full path | `/api/v1/elections/{election_id}/results` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN / USER after publication |
| Election state | CLOSED; USER also requires published results. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
GET /api/v1/elections/1001/results HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Result` response is fully expanded below; all fields are present, with null only where declared.

`Cache-Control: no-store`

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.election_id` | `ID` | No | Closed election being counted. |
| `data.position_title` | `string` | No | Single position inherited from the election; 1–100 characters. |
| `data.results_published_at` | `Timestamp` | Yes | null for ADMIN unpublished preview; otherwise original publication time. |
| `data.total_votes` | `integer` | No | Nonnegative sum of all candidates' vote_count. |
| `data.candidates` | `object[]` | No | Include zero votes; sort count descending, then display_order and numeric id. |
| `data.candidates[].candidate_id` | `ID` | No | Candidate in the election; same names remain distinct IDs. |
| `data.candidates[].name` | `string` | No | Candidate name; 1–100 characters. |
| `data.candidates[].vote_count` | `integer` | No | Nonnegative count of valid choices for this candidate. |
| `data.winner_candidate_id` | `ID` | Yes | Unique highest positive-vote candidate only; null for ties/zero votes, without tie-breaking. |

**Complete success example**

```json
{
  "data": {
    "election_id": "1001",
    "position_title": "Class Representative",
    "results_published_at": "2026-10-02T04:05:00Z",
    "total_votes": 1,
    "candidates": [
      {
        "candidate_id": "101",
        "name": "Candidate A",
        "vote_count": 1
      },
      {
        "candidate_id": "102",
        "name": "Candidate B",
        "vote_count": 0
      }
    ],
    "winner_candidate_id": "101"
  }
}
```

The example is published. ADMIN preview before publication has results_published_at=null; USER cannot receive that preview.

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `ELECTION_NOT_CLOSED` | Counting/publication requires CLOSED. |
| 409 | `RESULTS_NOT_PUBLISHED` | USER requests an unpublished result. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

Error responses also use Cache-Control: no-store.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "RESULTS_NOT_PUBLISHED",
    "message": "USER requests an unpublished result."
  }
}
```

#### Business rules and retry behavior

- No body/query; success 200 Result.
- Count only CLOSED elections. ADMIN can recount before publication (results_published_at=null); USER reads only after publication.
- Follow the SRS: all ACTIVE USER accounts can read published results, including non-members; do not invent finer disclosure policies.
- Aggregate ballot_choices, including zero-vote candidates. GET does not publish, store snapshots or write counts. Tied/zero-vote results have a null winner, without automatic selection.
- Errors: `ELECTION_NOT_FOUND`; ADMIN before CLOSED gets `ELECTION_NOT_CLOSED`; USER before publication always gets `RESULTS_NOT_PUBLISHED`.

Read-only: retry/poll only with finite limits and timeouts. Reads do not reserve quota or publish results.

[Back to operation index](#api-index)

---

<a id="endpoint-20"></a>

### 4.20 Publish results

Publish a closed election's computed result without accepting client totals.

#### Basic information

| Item | Value |
| --- | --- |
| Method | `POST` |
| Full path | `/api/v1/elections/{election_id}/results/publish` |
| Authentication | Required: `Authorization: Bearer <access-token>`; account must remain ACTIVE. |
| Permission | ADMIN |
| Election state | CLOSED; unresolved-winner guard remains a draft decision. |
| Success status | 200 |
| Request format | HTTPS; no request body and no Content-Type needed. |

#### Request parameters

**Path parameters**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `election_id` | `ID` | Yes | Target election. |

**Query parameters**

None. Undeclared query fields return 422 VALIDATION_ERROR.

**JSON body**

None. Do not send JSON, including an empty object; an unexpected body returns 422 VALIDATION_ERROR.

**Types used here:** ID is a positive decimal string matching `^[1-9][0-9]*$`, at most `18446744073709551615`. Timestamp is RFC 3339 with timezone and whole-second precision; input allows Z/offset and output uses UTC Z. Names, titles and required introductions are nonblank; passwords are nonempty and never trimmed.

#### Request example

```http
POST /api/v1/elections/1001/results/publish HTTP/1.1
Host: api.example.invalid
Authorization: Bearer <access-token>
```

The hostname, IDs and credentials are illustrative, not a running-service test.

#### Successful response

**HTTP 200** · Content-Type: application/json. The `Result` response is fully expanded below; all fields are present, with null only where declared.

`Cache-Control: no-store`

| Field | Type | Nullable | Description |
| --- | --- | --- | --- |
| `data` | `object` | No | Success payload. |
| `data.election_id` | `ID` | No | Closed election being counted. |
| `data.position_title` | `string` | No | Single position inherited from the election; 1–100 characters. |
| `data.results_published_at` | `Timestamp` | Yes | null for ADMIN unpublished preview; otherwise original publication time. |
| `data.total_votes` | `integer` | No | Nonnegative sum of all candidates' vote_count. |
| `data.candidates` | `object[]` | No | Include zero votes; sort count descending, then display_order and numeric id. |
| `data.candidates[].candidate_id` | `ID` | No | Candidate in the election; same names remain distinct IDs. |
| `data.candidates[].name` | `string` | No | Candidate name; 1–100 characters. |
| `data.candidates[].vote_count` | `integer` | No | Nonnegative count of valid choices for this candidate. |
| `data.winner_candidate_id` | `ID` | Yes | Unique highest positive-vote candidate only; null for ties/zero votes, without tie-breaking. |

**Complete success example**

```json
{
  "data": {
    "election_id": "1001",
    "position_title": "Class Representative",
    "results_published_at": "2026-10-02T04:05:00Z",
    "total_votes": 1,
    "candidates": [
      {
        "candidate_id": "101",
        "name": "Candidate A",
        "vote_count": 1
      },
      {
        "candidate_id": "102",
        "name": "Candidate B",
        "vote_count": 0
      }
    ],
    "winner_candidate_id": "101"
  }
}
```

#### Error responses

| HTTP | error.code | When it occurs |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired identity or account no longer ACTIVE. |
| 403 | `PERMISSION_DENIED` | Authenticated caller has the wrong role. |
| 404 | `ELECTION_NOT_FOUND` | Election absent, or detail outside visibility. |
| 409 | `ELECTION_NOT_CLOSED` | Counting/publication requires CLOSED. |
| 409 | `RESULT_NOT_DECIDED` | No unique positive-vote winner; draft safeguard pending D-06. |
| 422 | `VALIDATION_ERROR` | Malformed JSON, invalid types/fields/paths/query, unknown fields or empty PATCH. |
| 500 | `INTERNAL_ERROR` | Unexpected internal failure; disclose no SQL, credentials or traces. |

Error shape: error.code and error.message are required strings; optional error.details is an array of objects with string field/reason, never raw input. For 401 on a protected operation include WWW-Authenticate: Bearer.

Clients must branch on error.code, not message wording. Never return SQL, stack traces, passwords, tokens or raw vote input in an error.

Error responses also use Cache-Control: no-store.

**Example: HTTP 409**

```json
{
  "error": {
    "code": "RESULT_NOT_DECIDED",
    "message": "No unique positive-vote winner; draft safeguard pending D-06."
  }
}
```

#### Business rules and retry behavior

- ADMIN; CLOSED only; no body/query; success 200 Result. Clients cannot supply totals, winners or publication timestamps.
- Recompute and set results_published_at using server time within the transaction. No PUBLISHED state or results table.
- Draft retry convention: lock the election row exclusively and check publication in that transaction. If already published, return the original result/publication time without overwriting the timestamp; concurrent requests must not publish twice.
- Draft safeguard: without a unique positive-vote winner, return `409 RESULT_NOT_DECIDED` and leave unpublished. **Requires D-06 review**, not an approved tie-break or automatic runoff.
- Other errors: `ELECTION_NOT_FOUND`, `ELECTION_NOT_CLOSED`.

- Repeated open/close returns 409; GET the election to reconcile. Repeated publication returns the original timestamp without overwriting it.

[Back to operation index](#api-index)

<a id="error-dictionary"></a>

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

<a id="workflow"></a>

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

<a id="acceptance"></a>

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

<a id="review-decisions"></a>

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
| 2026-10-01 | API v0.1 draft — reading layout | Reorganize into 20 self-contained endpoint references with local parameter/response/error tables, complete examples and clickable navigation; no route, field or business-rule changes. |
