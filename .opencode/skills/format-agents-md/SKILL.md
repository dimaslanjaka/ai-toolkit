---
name: format-agents-md
description: Format and structure AGENTS.md entries for consistency and readability.
---

# Format AGENTS.md

Ensure AGENTS.md entries follow a consistent format.

## Entry Format Rules

- Each entry is a single `- ` bullet (no nested bullets unless listing sub-items).
- Commands use backtick-fenced code: `` `yarn build` ``.
- Multi-step pipelines use arrow notation: `step1` → `step2` → `step3`.
- File paths use forward slashes even on Windows: `.husky/pre-commit`.
- Keep entries concise — one concept per bullet.
- Group related entries (build, lint, test, hooks) with blank-line separators.

## Section Order

1. Project structure (monorepo, module system)
2. Build
3. Lint/format
4. Test
5. Pre-commit/hooks
6. Dev workflows
7. Path/imports conventions
8. Memory rules
9. Language-specific guidelines

## Rules
- Do not duplicate information across bullets.
- Prefer linking to config files over inlining full config content.
- Use TODO comments for uncertain items rather than guessing.
