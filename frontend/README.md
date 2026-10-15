# Frontend foundation

React + TypeScript + Vite frontend scaffold for the election management and voting system.

**Scope:** the shared frontend foundation, M1 login form, and M3 election list are implemented. The list uses the existing `api.elections` wrapper, server-side status filtering and pagination (20 per page), localized times, admin-only create navigation, and loading/empty/error/retry states. Other business routes remain placeholders. There are no fake login accounts or demo rows in the real election list. A development-only preview is described below. Election endpoints are still pending in the backend master baseline; API wrappers target the **draft** contract in `../API.md`, and complete live integration is not verified.

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
npm run build
npm run preview
```

## Directory boundaries

```text
src/
  routes/       Route tree, authentication and role guards
  pages/        Public landing page, login, election list and remaining placeholders
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

Election list tests use mocked API responses and cover authentication redirects, role-based create navigation, detail links with BIGINT string IDs, pagination/filter reset, failure versus empty results, manual retry, and stale response handling. These are not live backend integration tests.

Replace the remaining placeholders one module at a time. Election detail and create links currently lead to placeholders; their forms and workflows are separate tasks. Reconcile draft API changes and verify the list against real backend data when election endpoints are available.

## Local election list preview

With npm run dev, open /__preview/elections on the printed local origin.
This development-only route reuses the real list view with clearly labeled fictional
elections, no login, and three rows per preview page. Filtering and pagination work
locally; create/detail links only display an explanation and do not navigate or write data.
It does not set a token or change the real auth guards. Normal shell navigation still
opens real routes, which require authentication. Production builds omit the preview route
and its example module. Real /elections continues to use the backend and 20 rows per page.
