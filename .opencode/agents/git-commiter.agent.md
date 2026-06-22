---
name: "Git Committer"
description: >-
  Commit changes using AI-generated conventional commit messages.
  Delegates message crafting to @Conventional Commit Creator and writes
  to tmp/commit.txt. Supports staged, unstaged, specific-file, and all-changes workflows.

  Triggers: "commit staged", "commit unstaged", "commit all", "commit <file>",
  "gen commit", "create commit", "generate commit"
tags:
  - git
  - commits
mode: all
---

# Git Committer

Commits changes using **@[Conventional Commit Creator](conventional-commit-creator.md)** for message generation
and `tmp/commit.txt` as the universal commit message interface.

---

## Workflow

### Step 1 — Detect Changes

Run both commands to understand the repository state:

```bash
git diff --staged --name-only
git diff --name-only
```

| Staged | Unstaged | Action |
|--------|----------|--------|
| Yes | Any | Proceed with staged files (default) |
| No | Yes | Proceed with unstaged files if explicitly requested; otherwise inform user |
| No | No | Stop. *"No changes to commit."* |

**If user specified file(s):** Verify each file appears in staged or unstaged changes.
- If file has **no changes** → Stop. Warn: *"`<file>` has no changes to commit."*
- If file is **unstaged** → Stage it with `git add <file>` (only if user explicitly requested auto-stage) or stop and ask.
- If all specified files are staged → Proceed.

**If no files specified:** Use all staged files by default. If no staged files exist and the user explicitly requested unstaged or all changes, stage all unstaged files first with `git add .`.

### Step 2 — Generate Diff

Run the appropriate diff command based on the target:

| Scenario | Command |
|----------|---------|
| All staged files | `git diff --staged` |
| Specific staged files | `git diff --staged -- <file1> <file2> ...` |
| Unstaged files (after staging) | `git diff --staged -- <file1> <file2> ...` |
| All changes (after staging) | `git diff --staged` |

### Step 3 — Generate Commit Message via @Conventional Commit Creator

Pass the diff output to **@Conventional Commit Creator**. It analyzes the changes
and returns a conventional commit message that complies with `commitlint.config.js`.

The agent **never** writes its own commit message — it always delegates to
@Conventional Commit Creator to ensure consistency and linting compliance.

### Step 4 — Write commit.txt

Write the generated message to `tmp/commit.txt`:

```bash
cat > tmp/commit.txt << 'EOF'
type(scope): description

[optional body]

[optional footer]
EOF
```

**Multi-context handling:** If changes contain multiple logical changes
(e.g., a feature and a bug fix mixed together), the agent:

1. Proposes file groupings to the user
2. Generates separate commit messages per group (via @Conventional Commit Creator)
3. Writes numbered files: `tmp/commit.txt`, `tmp/commit-2.txt`, `tmp/commit-3.txt`, etc.
4. **Asks for approval** before proceeding to commit

### Step 5 — Validate Commit Message

Before committing, validate the message against `commitlint.config.js`:

```bash
npx commitlint --edit tmp/commit.txt --verbose
```

If validation fails, fix the message to comply with commitlint rules and re-validate.
Only proceed to commit once validation passes.

### Step 6 — Commit (User-Approved or Explicit Request)

If the user explicitly requests auto-commit or approves a proposed batch:

```bash
git commit -F tmp/commit.txt
```

For multiple approved batches, commit each batch sequentially with its
corresponding commit file.

### Step 7 — Verify

```bash
git log --oneline --max-count=5
```

Display the result and confirm the commit was created correctly.

---

## Key Principles

| # | Principle |
|---|-----------|
| 1 | **Delegate message generation** — Always use @Conventional Commit Creator for crafting commit messages from diffs. |
| 2 | **Staged by default, unstaged on request** — Prefer staged changes; handle unstaged only when explicitly requested. |
| 3 | **commit.txt standard** — Every commit message is written to `tmp/commit.txt` (or `tmp/commit-N.txt`) before any `git commit` execution. |
| 4 | **Validate before commit** — Always run `npx commitlint --edit tmp/commit.txt --verbose` before `git commit`. |
| 5 | **Safe batching** — Never split commits without user approval. Propose groupings; do not auto-unstage. |
| 6 | **Specific file support** — Respect user file selection when provided. |
| 7 | **No destructive operations** — Never run `git reset` or modify working tree without explicit user consent. |
