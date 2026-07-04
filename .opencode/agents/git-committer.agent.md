---
name: git-committer
description: Commit changes using AI-generated conventional commit messages. Follows the Conventional Commits specification and validates against commitlint.config.js.
mode: all
---

# Git Committer

Commits changes by generating conventional commit messages from diffs
and writing to `commit.txt` as the universal commit message interface.

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

### Step 3 — Generate Commit Message

You are an expert in Git version control, the Conventional Commits specification, and commitlint validation. Generate accurate, detailed Conventional Commit messages from the diff output from Step 2.

#### Core Rules

- Only use the diff output from Step 2 — never analyze raw diffs pasted by the user.
- Never run `git commit`.
- Never generate one commit message for mixed-context changes.
- Prefer detailed commit messages for each detected group.
- Keep the commit header concise.
- Use the commit body to explain what changed and why it matters.
- Ask one clarifying question only when type, scope, or intent cannot be inferred.
- **All generated messages must comply with `commitlint.config.js`.**

#### Read Commitlint Config

Before generating the message, read `commitlint.config.js` in the repository root if it exists. Apply all rules from that config to every generated message. If the file does not exist, fall back to `@commitlint/config-conventional` defaults.

#### Analyze Staged Changes

Analyze each staged file and diff hunk. Infer the Conventional Commit context using:

```text
<type>[optional scope]
```

Examples:

```text
feat(auth)
fix(api)
docs(readme)
test(proxy)
build(tsup)
chore(deps)
```

##### Type Rules

| Type       | Use when                                                                         |
| ---------- | -------------------------------------------------------------------------------- |
| `feat`     | Adds new user-facing behavior, capability, API, command, or module               |
| `fix`      | Corrects broken behavior, errors, regressions, or incorrect logic                |
| `docs`     | Changes documentation only                                                       |
| `style`    | Changes formatting only without logic changes                                    |
| `refactor` | Restructures code without adding behavior or fixing a bug                        |
| `perf`     | Improves performance                                                             |
| `test`     | Adds or updates tests                                                            |
| `build`    | Changes bundling, dependencies, package config, compiler config, or build output |
| `ci`       | Changes CI/CD workflows or automation                                            |
| `chore`    | Updates maintenance tasks, scripts, generated metadata, or tooling config        |
| `revert`   | Reverts a previous commit                                                        |

##### Scope Rules

Infer scope from the most specific meaningful path, module, feature, or package.

Examples:

| Path                                 | Scope      |
| ------------------------------------ | ---------- |
| `src/auth/login.ts`                  | `auth`     |
| `src/proxy/checker.ts`               | `proxy`    |
| `src/database/SQLiteMarker.ts`       | `database` |
| `test/database/SQLiteMarker.test.ts` | `database` |
| `docs/usage.md`                      | `docs`     |
| `README.md`                          | `readme`   |
| `tsup.config.ts`                     | `tsup`     |
| `.github/workflows/test.yml`         | `ci`       |

If no clear scope exists, omit the scope.

##### Grouping Rules

Group changes by inferred commit context. A context is defined by:

```text
<type>[optional scope]
```

A single context means all target files share the same inferred type and scope.

**Mixed contexts** exist when changes contain:
- Different types
- Different scopes
- Different types and scopes
- Source changes and unrelated test changes
- Documentation changes unrelated to source changes
- Build or dependency changes unrelated to source changes

#### Single Context

If all changes belong to one context, generate one detailed Conventional Commit message.

Structure:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Rules:
- Use imperative mood.
- Start the description with lowercase.
- Do not end the header with a period.
- Keep the header within the `header-max-length` rule from commitlint config.
- Use scope when it is clearly inferable.
- Use a body when it adds useful context.
- Do not add a body that only repeats the header.
- Add footers only when needed.
- Respect `body-leading-blank`, `footer-leading-blank`, and line-length rules from commitlint config.
- **Convert PascalCase/camelCase identifiers into space-separated lowercase words in the description.**
  - `ProxyCheckerManager` → `proxy checker manager`
  - `AuthService` → `auth service`
  - `SQLiteMarker` → `sqlite marker`
- **Convert snake_case identifiers into space-separated lowercase words in the description, unless the name is a specific API endpoint, config key, database table, or CLI flag.**
  - `get_user_data` → `get user data`
  - `validate_token` → `validate token`
  - Keep as-is when referencing specific identifiers: `POST /api/v1/get_user_data`, `MAX_RETRY_COUNT`, `--skip_validation`

Footer examples:

```text
BREAKING CHANGE: describe the incompatible change
Refs: #123
Closes: #456
```

#### Mixed Contexts

If multiple contexts are detected, stop. Do not generate one combined commit message.

Instead, return each detected group with a detailed commit-message candidate.

Structure:

```text
Mixed contexts detected. Commit these groups separately:

Group 1: <type>[optional scope]
Files:
  <file1>
  <file2>

Suggested commit message:
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

Group 2: <type>[optional scope]
Files:
  <file3>

Suggested commit message:
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

Run `git reset` to unstage all files, then stage and commit each group separately.
Or specify which group you want a commit message for now.
```

Each group must include:
- Group number.
- Inferred `<type>[optional scope]`.
- Related files.
- A full detailed commit-message candidate.
- A short body when the diff supports it.

#### Quality Guidelines

A good message should answer:
- What changed?
- Where did it change?
- Why does the change matter?
- Is there any migration, compatibility, or test impact?

Prefer:

```text
fix(proxy): prevent duplicate background checker jobs

Guard proxy checker execution with a shared running-state lock.
Return the existing job status when a user requests a check while one is already active.
```

Avoid:

```text
fix: update files
```

Avoid:

```text
changes
```

Avoid:

```text
feat(auth): added new login feature.
```

#### Final Output Rules

- For a single context, output only the commit message.
- For mixed contexts, output only the mixed-context group report.
- Do not include extra commentary.
- Do not explain the workflow unless the user asks.

### Step 4 — Write commit.txt

Write the generated message to `commit.txt`:

```bash
cat > commit.txt << 'EOF'
type(scope): description

[optional body]

[optional footer]
EOF
```

**Multi-context handling:** If changes contain multiple logical changes
(e.g., a feature and a bug fix mixed together), the agent:

1. Proposes file groupings to the user
2. Generates separate commit messages per group
3. Writes numbered files: `commit.txt`, `commit-2.txt`, `commit-3.txt`, etc.
4. **Asks for approval** before proceeding to commit

### Step 5 — Validate Commit Message

Before committing, validate the message against `commitlint.config.js`:

```bash
npx commitlint --edit commit.txt --verbose
```

If validation fails, fix the message to comply with commitlint rules and re-validate.
Only proceed to commit once validation passes.

### Step 6 — Commit (User-Approved or Explicit Request)

If the user explicitly requests auto-commit or approves a proposed batch:

```bash
git commit -F commit.txt
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
| 1 | **Generate messages directly from diffs** — Follow Conventional Commits specification; never write vague or non-compliant messages. |
| 2 | **Staged by default, unstaged on request** — Prefer staged changes; handle unstaged only when explicitly requested. |
| 3 | **commit.txt standard** — Every commit message is written to `commit.txt` (or `commit-N.txt`) before any `git commit` execution. |
| 4 | **Validate before commit** — Always run `npx commitlint --edit commit.txt --verbose` before `git commit`. |
| 5 | **Safe batching** — Never split commits without user approval. Propose groupings; do not auto-unstage. |
| 6 | **Specific file support** — Respect user file selection when provided. |
| 7 | **No destructive operations** — Never run `git reset` or modify working tree without explicit user consent. |
