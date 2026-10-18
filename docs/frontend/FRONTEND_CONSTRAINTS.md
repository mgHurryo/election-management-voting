# Frontend Design and Product Constraints

This document records the current product and design decisions for the election frontend. It is a concise implementation contract, not a replacement for the API contract or backend authorization rules.

## Decision Order

When sources disagree, apply them in this order:

1. The user's latest explicit decision.
2. This document, updated through reviewed changes.
3. Future user-approved demo HTML and component library, once provided and reviewed.
4. Existing frontend implementation and earlier design material.

The earlier design prompt is useful background, but later decisions supersede some of its assumptions. The product is organization-neutral rather than campus-only, and the active interface is English-only. Do not add a language switch or translation system until requested.

The demo HTML and component library are still being prepared. Any available files are working drafts until the user confirms them; this change neither edits nor ignores those canonical project assets. When the user approves them, update this document to reflect the accepted decisions. The imported local skill and reference captures described by `.gitignore` are not canonical project assets.

## Product and Audience

The product is a public-facing election and voting experience for communities, associations, companies, and other organizations. It is not an internal corporate dashboard. A voter should be able to understand an active election, compare candidates fairly, and cast a clear, trustworthy ballot.

Keep voter and administrator tasks distinct. Voters use a focused, editorial layout without a conventional dashboard sidebar. Administrative tasks may be denser, but admin structure must not define the voter experience. Reuse only the brand, typography, and foundational design tokens where that improves consistency.

## Visual Direction

The approved direction is an editorial hybrid of gazette typography and election-poster composition. Use typography, whitespace, alignment, and purposeful proportion to create identity. The interface should feel composed and current, serious without looking like a government portal, and expressive without obscuring the task.

Current foundational colors are:

| Token         | Value     | Use                                       |
| ------------- | --------- | ----------------------------------------- |
| `--paper`     | `#F7F3EB` | Main paper-like background                |
| `--bone`      | `#E8E0D4` | Secondary surface and image fallback      |
| `--ink`       | `#24221F` | Primary text and dark emphasis            |
| `--verm`      | `#C9473A` | Primary action and selected state         |
| `--verm-deep` | `#A8382D` | Text emphasis requiring stronger contrast |

Use the existing CSS tokens in `frontend/src/styles.css` as the implementation source. Display typography uses Source Serif 4 with the existing serif fallbacks; interface and body text use the existing sans-serif stack. Keep tabular alignment for numeric dates and counts where it aids scanning.

Avoid corporate blue/green dashboard themes, purple-blue gradients, card-heavy page composition, decorative glass effects, generic analytics panels, and styling changes that only alter color or corner radius while leaving the wrong information hierarchy intact. Use framed surfaces only when they represent a real object such as a candidate item, ballot, or confirmation dialog.

## Information and Interaction

- Keep the current elections experience focused on elections available to the user; do not introduce a separate marketing homepage or duplicate list entry points without an explicit product decision.
- Candidate presentation must give every candidate equal visual weight. Do not show popularity, live vote totals, or ranking that could steer voters.
- Candidate display modes may change density, but preserve consistent names, role, description, selection affordance, and ordering. Candidate numbers derive from the displayed order, not potentially duplicated server sort values.
- Keep election facts, voter choices, and administrative actions in clear, distinct groups. Avoid repeating policy explanations when one concise, well-placed explanation is sufficient.
- Preserve loading, empty, error, retry, and unavailable states. Do not present a failed or unauthorized read as an empty result.
- Use English copy throughout the current UI. Keep authentication and error messages specific, stable in layout, and connected to their relevant controls.

## Ballot and Trust Requirements

The frontend must preserve the existing business constraints:

- One vote per eligible voter and one candidate per ballot.
- A submitted vote cannot be edited, withdrawn, or deleted.
- Show the selected candidate for review and clearly warn that submission is irreversible before the final action.
- Preserve the existing anonymous-voting design. The active ballot may show the voter's temporary choice for review, but do not persist or expose a voter-to-choice association in receipts, logs, or stored records.
- Never display support percentages, live totals, or candidate rankings in the voting flow.
- Provide a clear selected state using more than color alone.
- Do not allow an uncertain or failed ballot read to enable voting. Eligibility, quota, election state, timing, and anonymity remain backend responsibilities.
- Never automatically repeat a non-idempotent vote submission. If its outcome is uncertain, block another attempt until authoritative voting status can be checked.

Route guards support navigation only; they do not replace server authorization. The frontend must not infer that a route or button makes a backend operation valid. A missing endpoint is a service limitation to report, not a reason to invent a local backend contract.

## Accessibility and Responsive Behavior

- Preserve semantic headings, labels, buttons, links, live status/error regions, and keyboard-operable controls.
- Keep visible focus indicators and ensure selected, disabled, error, and status states are not communicated by color alone.
- Prevent avoidable layout shifts when errors or asynchronous messages appear.
- Make layouts work at desktop, tablet, and narrow mobile widths without horizontal page overflow. Reflow content according to its reading and action order.
- Respect `prefers-reduced-motion`. Any transition must clarify a state change and remain optional; avoid scroll hijacking, 3D flips, floating panels, and particle effects.
- Maintain readable line lengths, wrapping for long user-provided text, and stable dimensions for controls whose labels may change.

## Frontend Architecture and Data Boundaries

- Follow the existing dependency direction: pages/components -> hooks/context -> API client -> HTTP. The frontend must not access the database or duplicate authoritative business rules.
- Preserve API envelopes, pagination metadata, nullable fields, and documented error codes. Keep IDs as decimal strings; do not coerce BIGINT identifiers to JavaScript numbers.
- Use existing loading/error helpers and typed API wrappers before adding new abstractions or dependencies.
- Keep credentials, access tokens, and sensitive vote data out of logs and rendered diagnostics. Never put secrets in `VITE_*` variables.
- Keep mock data confined to explicit development/test fixtures. It must not appear as real election data in normal workflows or production builds.

## Review and Verification

For UI changes, choose checks proportional to the changed behavior. At minimum, run relevant unit tests, typecheck, lint, and production build. Add or update browser tests for changed user flows and responsive behavior. Inspect rendered desktop and mobile states when layout or visual hierarchy changes; include error, empty, and selected states where relevant.

Use intercepted API responses for deterministic UI tests. Report live backend integration separately. Do not claim voting works when the backend ballot or vote endpoints are absent or unverified. Do not submit a real vote as a visual test.

## Local-Only Imported Materials

The root `.gitignore` excludes the currently imported Impeccable skill package, its hook configuration, local review screenshots, and copied reference captures under `plan/design-references/`. These are local tooling/reference artifacts and are not project deliverables.

The ignore rules are intentionally path-specific. Future user-provided demo HTML, approved component-library files, and project-authored frontend specifications must remain eligible for version control in their chosen canonical project paths. Do not broaden the ignore rules to `docs/`, `docs/design/`, `frontend/`, or all HTML/CSS files.
