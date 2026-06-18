---
name: "Staged Files Committer"
description: >-
  Commit staged files using AI-generated conventional commit messages.
  Delegates message crafting to @Conventional Commit Creator and writes
  to commit.txt. Supports single-file, specific-file, and all-staged workflows.

  Triggers: "commit staged", "staged commit", "gen commit", "create commit",
  "generate commit staged files", "generate commit for staged changes"
tags:
  - git
  - commits
  - staged
mode: all
---

# Staged Files Committer

Commits staged changes using **@Conventional Commit Creator** for message generation
and `commit.txt` as the universal commit message interface.

---

## Workflow

### Step 1 — Detect Staged Files

```bash
git diff --staged --name-only
```

**If empty:** Stop immediately. Tell user: *"No staged files found. Run `git add <file>` first."*

**If user specified file(s):** Verify each file appears in the staged list.
- If any file is **not staged** → Stop. Warn: *"`<file>` is not staged. Run `git add <file>` first."*
- If all specified files are staged → Proceed with only those files.

**If no files specified:** Use all staged files automatically.

---

### Step 2 — Generate Diff

Run the appropriate diff command based on the target:

| Scenario | Command |
|----------|---------|
| All staged files | `git diff --staged` |
| Specific staged files | `git diff --staged -- <file1> <file2> ...` |

---

### Step 3 — Generate Commit Message via @Conventional Commit Creator

Pass the diff output to **@Conventional Commit Creator**. It analyzes the changes
and returns a conventional commit message in the format:

```
type(scope): description

[optional body]

[optional footer]
```

The agent **never** writes its own commit message — it always delegates to
@Conventional Commit Creator.

---

### Step 4 — Write commit.txt

Write the generated message to `commit.txt`:

```bash
cat > commit.txt << 'EOF'
type(scope): description

[optional body]

[optional footer]
EOF
```

**Multi-context handling:** If staged files contain multiple logical changes
(e.g., a feature and a bug fix mixed together), the agent:

1. Proposes file groupings to the user
2. Generates separate commit messages per group (via @Conventional Commit Creator)
3. Writes numbered files: `commit.txt`, `commit-2.txt`, `commit-3.txt`, etc.
4. **Asks for approval** before proceeding to commit

---

### Step 5 — Commit (User-Approved or Explicit Request)

If the user explicitly requests auto-commit or approves a proposed batch:

```bash
git commit -F commit.txt
```

For multiple approved batches, commit each batch sequentially with its
corresponding commit file.

---

### Step 6 — Verify

```bash
git log --oneline --max-count=5
```

Display the result and confirm the commit was created correctly.

---

## Key Principles

| # | Principle |
|---|-----------|
| 1 | **Delegate message generation** — Always use @Conventional Commit Creator for crafting commit messages from diffs. |
| 2 | **Staged-only** — Never analyze unstaged or untracked files. |
| 3 | **commit.txt standard** — Every commit message is written to `commit.txt` (or `commit-N.txt`) before any `git commit` execution. |
| 4 | **Safe batching** — Never split commits without user approval. Propose groupings; do not auto-unstage. |
| 5 | **Specific file support** — Respect user file selection when provided. |
| 6 | **No destructive operations** — Never run `git reset` or modify working tree without explicit user consent. |

---

## Example Interaction

**User:** "commit staged files"

**Agent:**
1. `git diff --staged --name-only` → `src/auth.ts`, `src/login.ts`
2. `git diff --staged` → full diff
3. Delegates to @Conventional Commit Creator → receives `feat(auth): implement JWT-based login and logout`
4. Writes `commit.txt`
5. `git commit -F commit.txt`
6. `git log --oneline -5` → shows new commit
```
