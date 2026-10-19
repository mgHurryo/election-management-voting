# Frontend foundation

React + TypeScript + Vite frontend scaffold for the election management and voting system.

**Scope:** the shared frontend foundation, login, election list/detail, election creation and draft editing, candidate management, and the in-page ballot UI are implemented. The list uses the existing `api.elections` wrapper, server-side status filtering and pagination (20 per page), localized times, admin-only create navigation, and loading/empty/error/retry states. The ballot UI supports candidate selection, review, and confirmation, but the backend does not yet provide the ballot and vote-submission routes required to complete a real vote. Voter-roll and result routes remain placeholders. There are no fake login accounts or demo rows in the real election list. A development-only preview is described below. API wrappers target the **draft** contract in `../API.md`; complete live integration is not verified. See [Frontend design constraints](../docs/frontend/FRONTEND_CONSTRAINTS.md) for the approved product and visual direction.

## Quick start

Requires Node.js 22.12+ (validated with Node.js 24.13.0) and npm.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open the URL printed by Vite. `/` displays the framework shell without a backend. Protected routes redirect to the existing `/login` form. A working identity backend and pre-seeded account are required to reach `/elections`; without a working election endpoint the list shows an error, not demo rows.

Default API prefix: `/api/v1`. During development, Vite proxies `/api` to `http://127.0.0.1:8000`. Configure `API_PROXY_TARGET` in `.env.local` to change it. `VITE_API_BASE_URL` changes the public API base URL. Never place secrets in `VITE_*` variables. Local environment files must not be committed.

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npx playwright install chromium
npm run test:design-reference
npm run build
npm run preview
```

## Directory boundaries

```text
src/
  routes/       Route tree, authentication and role guards
  pages/        Landing page, login, election list/detail/create/edit, candidate management and remaining placeholders
  components/   Base layout, async states, render error boundary
  hooks/        Shared auth hook
  store/        Auth context/provider and access-token storage
  api/          Fetch client, typed endpoint wrappers, API draft contracts
  shared/       Public configuration and safe error-code messages
  test/         Shared test setup
```

Dependency direction: **pages/components → hooks/context → api → HTTP**. No database access or authoritative business rules belong in the frontend. The API module currently has wrappers for all 20 operations in the draft operation index; it does not execute workflows automatically.

## Routes

| Route                                   | Access        | Module           |
| --------------------------------------- | ------------- | ---------------- |
| `/`                                     | Public        | Framework status |
| `/login`                                | Public        | M1               |
| `/elections`                            | Authenticated | M3               |
| `/elections/:id`                        | Authenticated | M3               |
| `/elections/new`, `/elections/:id/edit` | ADMIN         | M3               |
| `/elections/:id/candidates`             | ADMIN         | M3               |
| `/elections/:id/voters`                 | ADMIN         | M2               |
| `/elections/:id/vote`                   | USER          | M4               |
| `/elections/:id/results`                | Authenticated | M6 / M7          |
| `/forbidden`                            | Public        | Access denied    |
| Unknown route                           | Public        | 404              |

The result route is only a placeholder; the backend must enforce CLOSED state for admins and publication rules for users. Route guards provide navigation UX, **not authorization**.

## Contract and security conventions

- IDs remain decimal **strings**, including BIGINT values. Never coerce IDs to Number.
- Domain statuses are DRAFT / OPEN / CLOSED. Publication is `results_published_at`, not another election status.
- JSON envelopes, pagination metadata, nullable fields and error codes follow the draft API.
- Access token is stored in localStorage per ADR-009. Passwords and voting choices are never stored or logged. Treat XSS prevention as mandatory when implementing future pages.
- Startup identity comes from `/auth/me`, not client JWT claims. Relevant cross-tab token changes invalidate stale identity and restore the current session. Protected 401 responses clear the matching session; stale requests do not clear a newer session. Network restoration and login failures settle loading and can be retried.
- Requests have a 15-second timeout, support AbortSignal, use `cache: no-store`, and have **no automatic retries**. State operations send no body; DELETE 204 is supported.
- Future voting UI must query `/participation` after an uncertain submission; it must not automatically repeat `/votes`.
- TypeScript types are compile-time contracts, not a full runtime response validator. The client validates the outer envelope only. Confirm DTOs as each planned backend endpoint is implemented; complete live integration is not verified.
- Permission, eligibility, quota, time window and anonymity enforcement remain backend responsibilities.
- Production should use HTTPS and a same-origin `/api/v1` reverse proxy. Configure the static host to return `index.html` for non-API client routes. `vite preview` is only for local build checks, not a production server.

## Verification and remaining implementation

The All filter uses one unfiltered server-paginated request and includes every visible election state. Open, Draft, and Closed filters use the existing status query. Closed elections remain reachable through Details, with the existing results entry shown according to publication state and role; the results page itself is still a placeholder.

Election list tests use mocked API responses and cover authentication redirects, role-based create navigation, detail links with BIGINT string IDs, pagination/filter reset, failure versus empty results, manual retry, and stale response handling. These are not live backend integration tests.

`npm run test:design-reference` opens the standalone design HTML in headless Chromium at 1280, 768, 390, and 320px. It checks horizontal overflow and election-row reading order, and writes screenshots to the ignored `test-results/design-reference/` directory. This verifies the reference layout, not application implementation or backend integration.

Voter-roll and result destinations remain placeholders. The in-page ballot UI supports candidate selection, review, and confirmation, but real vote submission requires backend ballot and vote-submission routes. Reconcile draft API changes and verify live behavior as backend endpoints become available.

## Local election list preview

With npm run dev, open /__preview/elections on the printed local origin.
This development-only route reuses the real list view with clearly labeled fictional
elections, no login, and three rows per preview page. Filtering and pagination work
locally; detail links open the corresponding development-only detail preview. The create link opens its own development preview. Other unfinished business links only display an explanation; they do not write data.
It does not set a token or change the real auth guards. Normal shell navigation still
opens real routes, which require authentication. Production builds omit the preview route
and its example module. Real /elections continues to use the backend and 20 rows per page.

## Election detail and candidate profiles

The authenticated /elections/:id route uses the existing election and candidate
API wrappers. A failed detail lookup does not trigger candidate requests. Candidate
loading/errors are independent of the election facts. Candidate pagination uses
the server metadata and retains string IDs. Profiles render plain text, optional
HTTPS photos (without a referrer), and a fallback when no photo is available.

Admins can request candidates in any election state. Users only request them for
OPEN elections; eligibility and the time window are still enforced by the backend.
Permission/time rejections explain the restriction rather than reporting an empty
candidate list. Route changes discard old responses and reset candidate pagination.

Admin DRAFT actions link to edit/candidate/voter pages and confirm opening. OPEN
admins can confirm closing; CLOSED admins can enter the result page. For OPEN
elections, users can select a candidate, review the selection, and confirm the
one-way ballot in the detail page. Closed users only see result navigation after
publication. Status writes run once per explicit confirmation and refresh server
state; failures offer a read refresh, not automatic write retries. Candidate
management and ballot UI are implemented, but real vote submission and result
publishing remain unavailable until the backend routes are implemented.

During npm run dev, /__preview/elections/:id shares this same detail view and shows
three explicitly fictional profiles in the administrator view. Return navigation
works; state confirmations and unfinished links only show a preview explanation.
No credentials are created and no real election reads/writes are sent by the preview.
The example module and preview routes are absent from production bundles.

The frontend screens use the current API wrappers, but mocked tests and local
previews do not establish that the real election APIs are ready. Live backend
integration remains unverified.

## Election creation and frontend handoff

ADMIN /elections/new now uses the existing create wrapper. The form validates
documented text limits, valid local dates, start-before-end, and nonempty unique
positive BIGINT string voter IDs. Local times convert to UTC with seconds.
Passwords/accounts/candidates are not created here. Successful creation navigates
to the returned election ID. Failed submissions preserve inputs; uncertain results
block another write until explicit review of the election list. No automatic retries.

Development /__preview/elections/new shares the same form, performs local validation
and shows a clearly labeled simulated result without calling the API or saving data.
It is reachable via the preview list's create link and is excluded from production.

See [A frontend delivery and teammate handoff (Chinese)](HANDOFF_CN.md) for page boundaries, route parameters,
existing API helpers and reusable components. This is a working handoff document;
live integration and the other business modules remain pending.

## Draft election editing

ADMIN /elections/:id/edit now loads the election independently, refuses non-DRAFT
records and PATCHes only changed writable fields. It does not query candidates or
edit voter_ids. Empty changes do not submit; clearing a description sends null.
The create/edit forms share ElectionFields and field validation. Datetime prefill
uses browser local time, retains seconds and compares instants before including
time fields. Save success returns to detail; errors preserve inputs. A state conflict
or uncertain write blocks saving until explicit reload of authoritative data.

Development /__preview/elections/1001/edit reuses the same form with fictional data
and a simulated patch summary only. Details link to it; simulated edits do not
persist or alter the list/detail fixtures. The production build excludes this route.
The list/detail/create/edit UI is implemented, not live-integration verified.
See HANDOFF_CN.md for teammate boundaries and remaining work.
