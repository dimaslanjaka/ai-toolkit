---
name: extract-workflows
description: Extract workflows, commands, and conventions from repo files (package.json, scripts, hooks, configs) for documentation.
---

# Extract Workflows

Scan repository files to discover undocumented workflows, commands, and conventions.

## When to Use
- Before updating AGENTS.md or similar reference docs
- When user asks to document what's in the repo
- After structural changes to build/test/CI pipelines

## Steps

1. **Read package.json** — extract all `scripts` entries, `bin` entries, and notable `dependencies`/`devDependencies`.
2. **Read build config** — `rollup.config.js`, `vite.config.mjs`, `tsconfig*.json`. Note multi-step pipelines and env vars.
3. **Read hooks** — `.husky/pre-commit`, `.github/workflows/*.yml`. Note pre-commit actions, CI triggers.
4. **Read lint/format config** — `eslint.config.mjs`, `lint-staged.config.js`, `.prettierrc.json`. Note per-file-type formatters.
5. **Read bin/** — note any custom scripts/launchers.
6. **Cross-reference** — compare discovered items against existing AGENTS.md to find gaps.

## Output
Return a structured list of findings:
- **New**: items not in current AGENTS.md
- **Existing**: items already documented (skip)
- **Uncertain**: items you're not sure about (add TODO)
