---
name: normalize-commands
description: Normalize command syntax in documentation for consistency across platforms.
---

# Normalize Commands

Ensure command references are accurate and consistent.

## Platform Considerations

- This repo uses Windows (`cmd` shell). Reference `bin\` scripts with `.cmd` extension.
- Use forward slashes in paths (cross-platform friendly): `src/openai-server/start.ts`.
- Document both Windows and Linux/macOS variants where they differ (e.g., `bin\openai-server.cmd` vs `bin/openai-server`).

## Command Format

- Shell commands: backtick-fenced, no prompt prefix.
- Environment variables: `VAR=value command` syntax.
- Multi-step chains: semicolon or `&&` as appropriate; document if sequential.
- npm/yarn: prefer `corepack yarn exec <cmd>` over `npx` when yarn is the package manager.

## Verification

Before adding a command to documentation:
1. Confirm the command exists (check `bin/`, `package.json` scripts, `node_modules/.bin/`).
2. Check if there's a platform-specific wrapper (`.cmd` on Windows).
3. Note any required env vars or flags.
