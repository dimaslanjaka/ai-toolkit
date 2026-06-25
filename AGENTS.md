# AGENTS QUICK REFERENCE

- Directory structure: see [`directory-structure.md`](directory-structure.md) for the full annotated project layout.
- Monorepo: `packages/*` workspaces, source in `src/` only.
- Module system: this project mixes ESM and CommonJS; preserve the module style used by the surrounding package and file.
- Build: `yarn build` (multi-step: `tsc -p tsconfig.build.json` → `rollup -c` → `build-cli.mjs` → `tsc -p tsconfig.dts.json` → `vite build`). Intermediate TS compiles to `tmp/dist/` before Rollup bundles to `dist/`.
- Include excluded entries in Rollup: `ROLLUP_ENTRIES=src/path/to/file.ts` adds files the default glob ignores (e.g., `*.runner.*`).

- Lint/format: prefer `corepack yarn exec eslint --fix <files>` (the repo does not define a `yarn eslint` script); TypeScript check `corepack yarn exec tsc --noEmit`.
- Test: `yarn test` (Jest) – tests under `test/`; single Jest file via `corepack yarn jest --runTestsByPath <file>`.
- Run single TS file: `node --no-warnings=ExperimentalWarning --loader ts-node/esm <file.ts>`.

- Lint-staged formatters: ESLint for `*.{js,cjs,mjs,ts,jsx,tsx}`; Prettier for `*.{json,css,scss,less,yml,yaml,sql,jsonc}`; `php-cs-fixer` for `*.php`; Black for `*.py`.

- OpenAI-compatible server dev mode: `bin/openai-server.cmd` (Windows) uses nodemon to watch `src/`, rebuilds via `tsc -p tsconfig.build.json && rollup -c`, then runs the built entry.
- Terminal PATH: before running commands, prepend repository-local executable directories so project tools take precedence:
  - Windows: `bin/`, `node_modules/.bin/`, `venv/Scripts/`, `.venv/Scripts/`, `vendor/bin/`.
  - Linux/macOS: `bin/`, `node_modules/.bin/`, `venv/bin/`, `.venv/bin/`, `vendor/bin/`.

- Scripts in `scripts/` (standalone Node.js tooling bootstrappers):
  - `scripts/ai-memory-installer.js` — Downloads the latest `ai-memory-mcp` binary from GitHub releases and installs to `node_modules/.bin/`.
  - `scripts/sqlite-installer.js` — Downloads the latest SQLite precompiled binary from sqlite.org and installs to `node_modules/.bin/`.

- Filesystem imports: use the default import `import fs from 'fs-extra'`; do not import from `fs` or `node:fs`.
- Path imports: use the default import `import path from 'upath'`; do not import from `path` or `node:path`.
- OpenAI-compatible server architecture and provider details: see `.opencode/memory/openai-compatible.md`.
  - Testing:
    - Testing openai server:
      > require multi terminal, or you can ask to user when server built and ready
      - 1st terminal: `gulp buildServer && node dist/openai-server/start.cjs`
      - 2nd terminal:
      ```bash
      curl -k -s -N https://localhost:5758/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"deepseek-v4-flash-free\",\"messages\":[{\"role\":\"user\",\"content\":\"search for buildOpenAIClient.ts\"}],\"stream\":true}" --max-time 60 | head -n 5
      # on windows cmd
      curl -k -s -N https://localhost:5758/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"deepseek-v4-flash-free\",\"messages\":[{\"role\":\"user\",\"content\":\"describe gulpfile.js\"}],\"stream\":true}" | more +0 | findstr /n "^" | findstr "^[1-5]:"
      # on powershell
      curl.exe -k -s -N https://localhost:5758/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"deepseek-v4-flash-free","messages":[{"role":"user","content":"describe gulpfile.js"}],"stream":true}' | Select-Object -First 5
      ```
    - To check if nodemon of `bin/openai-server.cmd` running using `wmic process where "name='node.exe'" get processid,commandline 2>nul | findstr /i "openai"`
- Memory system: this project uses two complementary memory systems:
  - **Letta-compatible markdown files** (`.opencode/memory/*.md`) for version-controlled, human-readable documentation
  - **ai-memory MCP** (SQLite-backed) for semantic recall and persistent agent knowledge

  **Letta Markdown Files:**
  - Before editing a file, check if its memory file exists at `.opencode/memory/<sanitized-filepath>.md` and read it first to understand prior context.
  - After editing a file, create or overwrite its memory block at `.opencode/memory/<sanitized-filepath>.md` with the updated content ([block format](https://github.com/joshuadavidthomas/opencode-agent-memory#block-format)).
  - Sanitize the edited file path by replacing `/` and `\` with `_`
  - Required YAML front-matter:
    - `description`: accurate purpose of the block—the file or feature it tracks
    - `label`: unique identifier equal to the sanitized filepath
    - `limit`: character budget; default to `5000`
    - `read_only: false`: allow future updates
  - Content structure (see `.opencode/memory/` for existing examples):
    - **Core Memory** — what the file or feature does (overview)
    - **Archival Memory** — dated entries (`### YYYY-MM-DD — Title`) with what happened and `**Tags**: `#tag``
    - **Recalled Memory (Working Context)** — active task context and relevant history retrieved
    - **Unresolved Threads / TODO** — follow-ups organized by priority

  **ai-memory MCP Integration:**
  - Database: `.opencode/memory/memories.db` (per-project, auto-created)
  - Full CRUD documentation: see [`docs/ai-memory.md`](docs/ai-memory.md)
  - Quick reference: `memory_store`, `memory_recall`, `memory_search`, `memory_list`, `memory_get`
  - **RECALL FIRST** at conversation start; **STORE LEARNINGS** when corrected (tier:`long`, priority:`9`)
- Memory system integration guidance:
  - When delegating to specialist agents (@oracle, @librarian, @explorer), remind them to:
    - Recall relevant memories before starting work
    - Store findings, decisions, and corrections for future sessions
    - Use memory namespaces aligned with the project or topic domain
  - After changing the OpenAI-compatible server or another AI API integration, update `.opencode/memory/openai-compatible.md`; keep it concise and limited to factual architecture details
- Staged‑file commit: use `git diff --staged` then generate conventional commit `<type>(<scope>): <subject>`; run `git commit -F tmp/commit.txt`. **Never run `git add` or `git commit` without the user's explicit request.**
  - **Never use `git add .` or `git add -A` or `git add --all`** — stage files per-file or per-logical-group only (`git add <file1> <file2>`).
  - Commit message must follow conventional commit format: `<type>(<scope>): <subject>` (e.g. `feat(cli): add --dry-run flag`, `fix(imports): resolve circular dependency`).
  - Commit messages should be generated via the @Conventional Commit Creator agent, which respects the rules in `commitlint.config.js`. The actual commit must be performed by the @Git Committer agent.
- React/TSX guidelines (`*.tsx, *.jsx`): Tailwind utility classes, Flowbite patterns, Font Awesome Pro icons; no CDN tags; PascalCase filenames; functional components default export.
- Python files (`*.py`): PEP 8, Black formatting, type hints, tests with pytest.
- PHP files (`*.php`): PSR‑12, PHP 8.1+, typed properties, PHPDoc for public API.

