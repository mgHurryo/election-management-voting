# Future Work (Backlog)

English / [简体中文](docs/future/FUTURE_CN.md)

---
> Related requirements: SRS v0.1 ([English](REQUIREMENTS.md) / [中文](docs/requirements/REQUIREMENTS_CN.md))
> Last updated: 2026-09-26

This file collects everything that is **not in the v0.1 MVP baseline**, in **three categories** — do not confuse them:

1. **Capabilities that may be adopted in a future version** — not built now, but **may appear in a future version** (FW-01 ~ FW-08);
2. **Rules and metrics to be defined in a future version** — items undecided in v0.1 and now deferred (FW-10 ~ FW-14);
3. **Permanently excluded items** — **will not appear in any future version**; these are NOT Future Work (FW-09).

The requirements document keeps only the decided v0.1 requirements; anything undecided or not built in this version is recorded here as the backlog for later iterations.

> **Only categories 1 and 2 are genuine Future Work** and may be brought into a future version by a group-leader decision.
> **Category 3 is a principled exclusion** and must not be read as "we will do it later"; it must not be adopted unless the project scope is fundamentally re-decided.

> **Change discipline**: to bring a category-1 or category-2 item into a version, the group leader must decide it, move it from this file back into the requirements document, bump the requirements document version, record the reason for the change, and re-check the consistency of the related FR / BR / AC (keeping the English and Chinese versions in sync). Category 3 is not subject to this process.

---

## 1. Capabilities that may be adopted in a future version (not built now)

These are not built in this version but **are candidate future work** and may be adopted later.

| ID | Item | Notes |
| --- | --- | --- |
| FW-01 | Multi-choice / scoring systems / judge scoring | v0.1 is single choice only |
| FW-02 | Multi-position elections | Electing president, vice-president, secretary, etc. in one election; v0.1 fills one position per election |
| FW-03 | Complex vote weighting | e.g. by shareholding ratio or group weighting |
| FW-04 | Multi-round / large competition-style selection flows | Zones, groups, multiple stages |
| FW-05 | Generic election workflow engine | A "generic template + personalized template" abstraction covering every electoral system |
| FW-06 | Independent governance roles | Separate accounts and permissions for auditor / system administrator / election committee; carried by the administrator in v0.1 |
| FW-07 | Real-time turnout display | Real-time turnout during voting |
| FW-08 | Operations and back-office capabilities | Vote receipts, audit log query, result export, email notification, back-office account management |

---

## 2. Rules and metrics to be defined in a future version (former v0.1 open items)

| ID | Item | v0.1 status | To be defined |
| --- | --- | --- | --- |
| FW-10 | Tie handling | Only "highest vote count wins"; ties are not handled | How ties are handled (administrator-run re-vote or automatic resolution) and automatic advancement |
| FW-11 | Quantitative performance metrics | No quantitative performance acceptance gate | Concurrent voters and response-time metrics for vote submission and counting, to be set after technical validation |
| FW-12 | Other election end conditions | Only "voting end time" is an end condition | Other end conditions such as "close automatically once a target vote count is reached" |
| FW-13 | Result visibility scope | Administrator publishes results; voters view published results | Finer per-role visibility policy |
| FW-14 | Candidate photo rule | Photo is optional | Whether it is mandatory and how a missing photo is handled |

---

## 3. Permanently excluded items (will not appear in any future version)

The following are **principled exclusions**. They are **not Future Work and will not be adopted in any future version**. Do not treat them as "we will do it later" candidates.

| ID | Item | Reason for exclusion |
| --- | --- | --- |
| FW-09 | Blockchain notarization, native mobile app, integration with a real voter database | Explicitly decided by the meeting as permanently out of project scope; inconsistent with this system's positioning and the course delivery goal |
