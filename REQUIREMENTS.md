# Requirements · Election Management and Voting System

English / [简体中文](docs/requirements/REQUIREMENTS_CN.md)

---
> Document version: **SRS v0.1** (draft)
> Last updated: 2026-09-26
> Scope: COMP3500SEF group project · Election Management and Voting System · first MVP
> Future work and undecided items: see [Future Work](FUTURE.md)

> Database schema, SQL, API endpoints, page layouts, class design and test code are out of scope for this document; they belong to the later Design / API / Implementation documents.

---

## 1. Introduction

### 1.1 Purpose

This document formalizes the conclusions reached at the Kickoff meeting (Meeting 01, 2026-09-25) into a structured requirements specification, serving as the common basis for subsequent interface design, task allocation and test verification.

Following the course's Requirement Engineering guidance, a good requirements document should be **complete** and **consistent**: every needed function is stated clearly, and the document does not contradict itself.

v0.1 is a baseline that contains **only decided content**: any rule or metric not yet settled by the meeting is not a requirement for this version and is deferred to [Future Work](FUTURE.md), so that developers never mistake a "to be confirmed" item for a "must build" one.

### 1.2 Project Overview

This project develops an **Election Management and Voting System** to help campus organizations (such as a class or a student union) run simple, runnable and testable elections and votes.

The MVP is primarily for **election administrators** and **voters**: an administrator creates and configures an election and maintains the candidate and voter lists; eligible voters log in and cast a ballot; after voting closes, the system counts the votes and publishes the result.

The project first delivers a **minimal runnable MVP**. The goal is not to support every complex electoral system, but to make one core path solid — a path that runs, can be demoed and can be verified:

```text
Configure election → Manage candidates and voters → Authentication and eligibility check → Vote → Count and publish results
```

### 1.3 Demo Scenario Baseline

This MVP locks in one **clear, ordinary and easy-to-verify** scenario as the delivery baseline (see Section 2):

> **Class President Election** — the class president has taken sick leave, so the class needs to elect a new one; single choice, one person one vote, the candidate with the most votes wins.

In the MVP, **one election fills exactly one position (class president)**. Electing multiple positions in a single election (e.g. president, vice-president and secretary together) is Future Work (FW-02).

The purpose of choosing a single scenario is to keep the requirement boundary clear and testable; other electoral systems are extensions after the MVP (see [Future Work](FUTURE.md)).

### 1.4 Version Scope (MVP)

This version is the project's minimal runnable Demo, intended for prototype implementation and validation. The first MVP covers the following capabilities (mainly mapping to modules M1–M7; M8 audit log is Future Work):

- Election configuration (M3)
- Candidate management (M3)
- Voter roll management (M2)
- Authentication (M1)
- Roles and basic access control (M1)
- Voting eligibility check (M2 / M4)
- Vote submission (M4)
- Vote-count limit / one person one vote (M4)
- Anonymous ballot storage (M5)
- Vote counting (M6)
- Result publishing (M7)

Note that the MVP scope **does not include** the following (full list in [Future Work](FUTURE.md)):

- Blockchain notarization
- Native mobile app
- Integration with a real voter database
- Complex multi-round elections
- Complex weighting mechanisms
- Complex tie-breaking and advancement mechanisms
- A generic workflow supporting every electoral system

> Among these, **blockchain notarization, native mobile app, and integration with a real voter database** are **permanently excluded** (FW-09, will not be done in any future version); the rest are **future candidates** that may be adopted in a future version (see [Future Work](FUTURE.md)).

> **Scope discipline**: whenever someone later proposes "should we also add XXX", check this section first. Anything not in the MVP scope is recorded as "not in v0.1" and goes to the backlog ([Future Work](FUTURE.md)); do not expand scope ad hoc. Any business change must be reported to the group leader first, who decides and records it in the change log.

### 1.5 Terminology

| Term | Meaning |
| --- | --- |
| Election | A complete voting activity, including name, position, time window, candidates and voter scope |
| Voter | A user listed on an election's roll and therefore eligible to vote |
| Candidate | The subject being elected; **in the MVP it is a business entity / data object, not a system Actor, and has no login account** |
| Voter Roll | The list of eligible voters for an election |
| Ballot | The choice a voter submits for a position |
| Valid ballot | A ballot that passed the eligibility check, was cast within the time window, did not exceed the vote limit, and was successfully stored |

---

## 2. System Scenario

Per the course requirements, a scenario should include: the initial situation, the normal event flow, possible problems, concurrent activities, and the end state.

### Scenario 1: Class President Election

**Initial situation**
The class president has taken sick leave, and a new class president must be elected. The election administrator (e.g. a tutor or class committee member) creates the election in the system.

**Normal flow**

1. The administrator creates the election, setting the election name, the position to fill (class president), and the voting start and end times.
2. The administrator enters candidate information (name, position, profile, photo) and adds the eligible students of the class to the voter roll.
3. During the open voting period, voters log in to the system.
4. The system verifies the voter's identity and checks whether they are on this election's roll.
5. After passing verification, the voter views the ballot, browses candidate profiles, and selects one candidate.
6. The system re-checks identity, eligibility and vote count, accepts the ballot, and blocks over-limit, ineligible or invalid votes.
7. After voting ends, the administrator closes the election.
8. The system counts the votes and the administrator publishes the final result; the candidate with the most votes is elected class president.

**Possible problems**

- A user is logged in but not on this election's roll → the system refuses entry to voting and reports "not eligible".
- A voter who has already voted tries to vote again → the system refuses, and the original ballot is not modified.
- An attempt to vote before the start or after the end of voting → the system refuses.
- A tie occurs → v0.1 does not handle it (see BR-08 and FW-10).

**Concurrent activities**
Multiple voters may vote online at the same time without seeing each other's ballot content; the administrator must not view or modify any ballot that has been cast.

**End state**
The election is closed, counting is complete and the result is published; the result is visible to authorized users, and the tallied numbers are consistent with the valid ballots stored in the system.

---

## 3. Actors

In the MVP the roles are reduced to **3**; only the administrator and the voter actually log in and operate the system.

### 3.1 Administrator

```text
Can:
- Create an election
- Configure an election
- Manage candidates
- Manage voters
- Open / close voting
- View and publish results

Cannot:
- Modify or delete a ballot that has already been cast
- See whom a specific ballot was cast for (anonymity, see NFR-2)
```

### 3.2 Voter

```text
Can:
- Log in
- Participate in eligible elections
- View their own ballot
- Vote
- View published results

Cannot:
- See whom others voted for
- Modify their ballot after casting it
- Exceed the allowed number of votes
```

### 3.3 Candidate (business entity, not a system Actor)

In the MVP, a candidate is a **business entity / data object, not a system Actor**. A candidate has no login account, and the administrator is responsible for maintaining their profile.
In plain terms: a candidate does not need to log in to the system; it is simply data managed and displayed by the system.

> Key principle: **An Actor ≠ an entity that appears in the database.** Only a subject that logs in and triggers system behavior is modeled as an Actor; a candidate is an Entity, not an Actor.

### 3.4 Roles mentioned in the meeting but not modeled separately in the MVP

The meeting slides once listed six system roles (voter, candidate, election administrator, auditor, system administrator, election committee). To control MVP scope:

- **Auditor / Election committee**: their duties (reviewing the count, accepting the result) are carried by the administrator in the MVP; no separate accounts or permissions are created.
- **System administrator**: account and runtime environment maintenance is handled by the development/deployment process in the MVP, not modeled as a business Actor.

Making these roles independent is listed in the backlog (FW-06).

---

## 4. Functional Requirements

Each requirement describes one thing and is testable. v0.1 states only decided requirements; anything undecided is not written here and is moved to [Future Work](FUTURE.md).

### FR-01 Create Election (M3)

```text
The system shall allow an administrator to create a new election.
When creating it, the administrator shall provide at least:
- Election name / title
- The position to be elected (MVP: one position per election)
- Voting start time
- Voting end time
- The scope of eligible voters
The system shall store the election information and allow it to be queried again.
```

> The MVP uses only the "voting end time" as the end condition; other end conditions (e.g. closing automatically once a target vote count is reached) are in FW-12.

### FR-02 Configure Election (M3)

```text
The system shall allow the administrator to configure the election's voting rules before voting starts.
The voting rules supported by the MVP are: single choice, one person one vote, highest vote count wins.
```

### FR-03 Manage Candidates (M3)

```text
The system shall allow the administrator to add, modify or delete candidates for a given election.
Each candidate shall include at least:
- Name
- The position being contested (title)
- A short profile
- Photo (optional)
The administrator may modify or delete candidates only before voting starts.
```

### FR-04 Manage Voter Roll (M2)

```text
The system shall allow the administrator to maintain the eligible voter roll for an election.
Only users present on a valid roll are eligible to vote in that election.
The system shall support de-duplication of the roll.
```

### FR-05 Authentication (M1)

```text
The system shall require a user to log in before entering the voting or administration flow.
If authentication fails, the system shall not allow the user to enter any protected function.
```

### FR-06 Roles and Access Control (M1)

```text
The system shall restrict the operations a user may perform according to their role (administrator / voter).
A user without the corresponding permission shall not access administrator functions or other people's data.
```

### FR-07 Voting Eligibility Check (M2 / M4)

```text
The system shall verify whether a user is eligible to vote in the election both before showing the ballot and before submitting it.
An ineligible user shall not view the ballot, nor submit a ballot.
```

### FR-08 View Ballot (M4)

```text
An eligible voter may view the ballot during the open voting period.
The ballot shall display the position of the current election together with the candidates and their profiles.
```

### FR-09 Cast Vote (M4)

```text
An eligible voter may submit a ballot during the open voting period.
The system shall store the valid anonymous ballot that passed all checks and return a success result.
A candidate's vote count is derived by the counting process (FR-12) from the valid ballots;
the voting phase only stores ballots and does not directly modify or increment any tally.
```

### FR-10 One Person One Vote Limit (M4)

```text
The system shall limit the number of votes each voter may cast in a single election (MVP: at most once).
When a user has reached the allowed number of votes, the system must reject any new voting request,
and must not modify the ballot they have already cast.
```

### FR-11 Anonymous Ballot Storage (M5)

```text
The system shall store valid ballots and keep the ballot content stored separately from the voter's identity.
The system shall not provide any capability to trace a ballot back to its voter.
```

### FR-12 Vote Counting (M6)

```text
The system shall be able to tally the number of valid votes each candidate receives.
The tally must be exactly consistent with the valid ballots stored in the system.
The system shall support re-verification of the result (re-counting yields the same result).
```

### FR-13 Open / Close Voting (M3)

```text
The system shall allow only the administrator to open or close voting for an election.
The administrator's state control must not break the configured voting time window (see BR-11, BR-12).
After the election is closed, the system shall not accept any new ballot.
```

### FR-14 Publish Results (M7)

```text
After the election ends, the administrator may publish the election result.
The result shall display at least:
- Each candidate and their vote count
- Turnout (optional)
- The final winner
```

> In the MVP, published results are visible to authorized users (administrator and voters); a finer per-role visibility policy is in FW-13.

---

## 5. Non-Functional Requirements

Classified per the course: **product requirements** (how the product must behave), **organizational requirements** (from team/course process), and **external requirements** (legal, interoperability, etc.). Non-functional requirements should be quantifiable where possible; anything that cannot yet be quantified in v0.1 is explicitly deferred to Future Work rather than written as a vague promise.

### NFR-1 Security (product)

- All user input, requests and external data are treated as untrusted and must undergo parameter and permission validation.
- Authentication, access control and eligibility checks must prevent vote stuffing, unauthorized voting and cross-election access.
- Credentials, passwords and other sensitive information must not be stored in plaintext or written to logs.

### NFR-2 Anonymity and Privacy (product, critical)

- Ballot content must be stored **separately** from the voter's identity; anonymity is guaranteed by data-model design, not by after-the-fact encryption.
- Once ballot storage points to a specific voter, anonymity can never be recovered no matter how it is later encrypted — so this constraint must be enforced at design time.
- No role may infer the voter from a given ballot.
- **How one-person-one-vote coexists with anonymity**: the system may record the state of whether a given voter "has already voted", used to enforce the one-person-one-vote limit; but this state must not contain, link to, or allow derivation of the specific ballot content that voter submitted.

```text
May store:      Alice -> has voted            ✅
Must not store: Alice -> voted for Bob        ❌
```

### NFR-3 Reliability and Data Consistency (product)

- No lost ballots, double counting or miscounting; the tally must be consistent with the valid ballots.
- Side-effecting operations such as vote submission must account for concurrency and idempotency, so the same voter cannot produce more than one valid ballot.

### NFR-4 Performance and Scale (product)

- The MVP targets class-level / small campus-organization elections.
- **v0.1 sets no quantitative performance acceptance gate**; quantitative metrics such as concurrent users and response time for vote submission and counting will be defined in a future version after technical validation (see FW-11).

### NFR-5 Usability (product)

- The voter's path from login to completing a vote should be simple and clear; key errors (not eligible, already voted, not open) should give understandable messages.

### NFR-6 Technical Constraints (organizational)

- The technology stack is decided: front end **React**, back end **Python FastAPI**, database **MySQL**.
- This constraint comes from a meeting decision and is recorded as an organizational constraint; implementation details are not expanded in this document.

### NFR-7 Testability and Delivery (organizational)

- **Confirmed at the Kickoff meeting**: after all members finish their own features, everyone participates in verification; automated tests are added where conditions allow. The requirements and interface documents are the development basis; interfaces must specify purpose, parameters and return values to avoid inconsistent definitions between front end and back end.
- **Project rules formally added by the group leader after the meeting** (not requirements confirmed at Kickoff): adopt test-first, where each member writes test cases for their own module first; CI must be fully green before a PR is merged.

### NFR-8 Time and Delivery Constraints (organizational)

- The project runs about six weeks; the first demonstrable Demo targets completion within two weeks, and no later than four weeks.
- If time is insufficient, deliver the stable base version first; put extensions on a separate branch, forming a "base version + extended version" pair.

### NFR-9 External Constraints

- The MVP does not integrate with a real voter database; it uses roll data maintained within the system.
- No blockchain notarization is introduced, and no native mobile app is provided.

---

## 6. Business Rules

Functional requirements describe "what the system can do"; business rules describe "the rules the system must obey when doing it".

```text
BR-01  Only a user eligible to vote in the corresponding election (on a valid roll) may vote.
BR-02  A user may submit a ballot only within the open voting period.
BR-03  A user must not exceed the maximum number of votes allowed in that election (MVP: one).
BR-04  No new ballot may be submitted after the election is closed.
BR-05  Only the administrator may create or modify elections, candidates and rolls.
BR-06  Only the administrator may open/close voting and publish the final result.
BR-07  In the class president election, each voter selects at most one candidate (single choice).
BR-08  The candidate with the most votes wins; v0.1 does not handle ties (tie handling is in FW-10).
BR-09  Once cast, a ballot cannot be modified, withdrawn, or deleted by anyone.
BR-10  No role may link a ballot to a voter's identity or trace it back; the system may record
       "whether a voter has voted" to enforce one-person-one-vote, but that state must not be linked
       to the ballot content.
BR-11  The system accepts a ballot only when the election state is OPEN and the current time is between
       the voting start time and end time. The time window determines whether a vote is valid.
BR-12  The administrator controls the election state (open/close) but must not break the time window:
       voting must not be opened before the configured start time, nor re-opened after the end time;
       the administrator may close the election early.
```

> Note: rules such as multi-choice, weighting, tie handling and multi-round advancement all belong after the MVP (see [Future Work](FUTURE.md)). For now only the minimal rule "single choice + one person one vote + highest vote count wins" is fixed; the rest keep room for configuration but are not implemented.

---

## 7. Acceptance Criteria

Requirements must be testable. The following use Given / When / Then to describe the key MVP acceptance points, against which the whole team verifies.

### AC-01 Create Election

```text
Given the administrator is logged in
When  the administrator fills in a valid election name, position, start and end time and submits
Then  the system successfully creates the election and it can be queried again
```

### AC-02 Eligible Voter Votes Successfully

```text
Given a voter is logged in, on this election's roll, voting is open, and they have not voted yet
When  the voter views the ballot, selects one candidate and submits
Then  the system stores this valid ballot and reports a successful vote
```

### AC-03 Ineligible User's Vote Is Rejected

```text
Given a user is logged in but not on this election's roll
When  the user tries to enter the voting page or submit a ballot
Then  the system rejects it and returns a "not eligible to vote" message
```

### AC-04 Duplicate Vote Is Rejected

```text
Given a voter has already voted once and this election allows at most one vote
When  the voter submits a ballot again
Then  the system must reject the request and the original ballot must not be modified
```

### AC-05 Vote Outside the Time Window Is Rejected

```text
Given the election has not started or is already closed
When  an eligible voter tries to submit a ballot
Then  the system rejects it and returns the corresponding not-open / already-ended message
```

### AC-06 Count and Publish Results

```text
Given the election is closed and there are several valid ballots
When  the administrator triggers counting and publishes the result
Then  each candidate's vote count is consistent with the valid ballots stored, and the candidate with the most votes is shown as the winner
```

### AC-07 Anonymity

```text
Given there are stored valid ballots
When  any role (including the administrator) queries the system data
Then  the voter's identity cannot be traced back from any ballot
```

### AC-08 State Control Must Not Break the Time Window

```text
Given the election's configured start time is T_start and end time is T_end
When  the administrator tries to open voting before T_start, or re-open voting after T_end
Then  the system rejects the operation; a ballot is accepted only when the state is OPEN and the current time is within [T_start, T_end]
```

---

## 8. Traceability

Used to ensure "function ↔ module ↔ acceptance" line up, making allocation and verification easier. Undecided items and capabilities not built in this version are all in [Future Work](FUTURE.md) (FW-xx).

| Module | Related functional requirements | Related business rules | Related acceptance criteria |
| --- | --- | --- | --- |
| M1 Identity & access | FR-05, FR-06 | BR-01, BR-05 | AC-03 |
| M2 Voter roll | FR-04, FR-07 | BR-01 | AC-03 |
| M3 Election configuration | FR-01, FR-02, FR-03, FR-13 | BR-02, BR-04, BR-05, BR-06, BR-11, BR-12 | AC-01, AC-05, AC-08 |
| M4 Ballot & voting | FR-08, FR-09, FR-10 | BR-02, BR-03, BR-07, BR-11 | AC-02, AC-04, AC-05 |
| M5 Ballot storage | FR-11 | BR-09, BR-10 | AC-07 |
| M6 Vote counting | FR-12 | BR-08 | AC-06 |
| M7 Results & reports | FR-14 | BR-06, BR-08 | AC-06 |

---

*This document is the SRS v0.1 draft, kept in sync with the Chinese version [`docs/requirements/REQUIREMENTS_CN.md`](docs/requirements/REQUIREMENTS_CN.md); future work is in [`FUTURE.md`](FUTURE.md). If the two differ, the version that passed the latest change review prevails.*
