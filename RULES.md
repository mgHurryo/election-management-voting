## Git Branching Guidelines

English / [简体中文](docs\RULES_CN.md)

### `master`

- Protected branch — **direct pushes are prohibited**
- All changes must enter through a **Pull Request (PR)**
- Deleting the branch and using `git push --force` are prohibited
- Linear history is **not required**
- Before a PR can be merged, it must pass:
  - Build
  - Tests
  - Required static analysis / Qodana / security checks
- Failed CI checks must **not** be bypassed by disabling branch protection or required checks
- Automatic PR merging is not allowed
- `master` must always remain in a buildable and testable state

### Task Branch

Naming convention:

```text
<type>/<ticket-id>-<short-description>
```

Common types:

```text
feature fix hotfix refactor performance
prompt agent tool skill eval security docs experiment chore
```

Rules:

- Each task must use its own dedicated branch
- A completed task branch must not be reused
- Always create task branches from the latest `master`
- When synchronizing with the main branch, prefer:

```bash
git fetch origin
git rebase origin/master
```

- If remote history on a task branch must be rewritten, only use:

```bash
git push --force-with-lease
```

- The following is prohibited:

```bash
git push --force
```

- Keep the scope of changes as small as possible
- Do not mix unrelated refactoring or cleanup into the same task
- When the task is complete, submit a PR to `master`

### `release`

- Protected branch — **direct pushes are prohibited**
- **Only PRs from `master` are accepted**
- Feature / fix / other task branches must not be merged directly into `release`
- Before merging, run the full Build, Test, quality, and security gates again
- `release` must always represent a stable state that is ready for release

Flow:

```text
Task Branch
    ↓ PR
master
    ↓ PR
release
    ↓
tag
    ↓
GitHub Release
```

### Tag / Release

- Tags may only be created from commits on `release` that have passed all required gates
- Use annotated tags
- Versions must follow Semantic Versioning (SemVer):

```text
v2.4.1
```

- A GitHub Release may only be created after the tagged build passes
- The same version number must never refer to different code

### Commit

- Any actual modification to the repository must be committed
- Each commit should have one clear purpose
- Do not include unrelated changes
- Format:

```text
<type>(<scope>): <description>

<body>
```

- The commit title must be concise, written in English, and use the present tense
- The body must explain:
  - What changed
  - Why it changed
  - The original problem
  - The solution
  - Testing performed
  - Risks / compatibility / migration notes when necessary

### PR

- A PR must be reviewable, testable, and rollback-friendly
- At minimum, it should explain:
  - Objective
  - What changed
  - What is intentionally not included
  - Risks
  - Behavioral changes
  - Verification / testing method
  - Security / performance impact
  - Release method
  - Rollback method

In one sentence:

```text
Work freely on the Task Branch
        ↓
      PR + CI
        ↓
master stays stable
        ↓
PR + full quality gates
        ↓
release stays deployable
        ↓
tag → GitHub Release
```