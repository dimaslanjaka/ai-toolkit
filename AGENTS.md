# AGENTS QUICK REFERENCE

- Monorepo: `packages/*` workspaces, source in `src/` only.
- Module system: this project mixes ESM and CommonJS; preserve the module style used by the surrounding package and file.
- Build: `yarn build` (multi-step: `tsc -p tsconfig.build.json` → `rollup -c` → `build-cli.mjs` → `tsc -p tsconfig.dts.json` → `vite build`). Intermediate TS compiles to `tmp/dist/` before Rollup bundles to `dist/`.
- Include excluded entries in Rollup: `ROLLUP_ENTRIES=src/path/to/file.ts` adds files the default glob ignores (e.g., `*.runner.*`).
- Lint/format: prefer `corepack yarn exec eslint --fix <files>` (the repo does not define a `yarn eslint` script); TypeScript check `tsc --noEmit`.
- Test: `yarn test` (Jest) – tests under `test/`; single Jest file via `corepack yarn jest --runTestsByPath <file>`.
- Run single TS file: `node --no-warnings=ExperimentalWarning --loader ts-node/esm <file.ts>`.
- Pre-commit hook (`.husky/pre-commit`):
  - Auto-stages submodule pointer changes (skipped on CI).
  - Regenerates CI workflow YAML when test files are staged: `bcc generate-ci` → stages `.github/workflows/test.yml`, `.github/actions/setup-environments/action.yml`, `.github/workflows/build-release.yml`.
  - Runs `corepack yarn exec lint-staged --config lint-staged.config.js --no-stash` for lintable files.
  - Sets up `resolve_hash` merge driver (idempotent).
  - Verifies release tarballs (`release/`, `releases/`) do not exceed 10 MB.
- Lint-staged formatters: ESLint for `*.{js,cjs,mjs,ts,jsx,tsx}`; Prettier for `*.{json,css,scss,less,yml,yaml,sql,jsonc}`; `php-cs-fixer` for `*.php`; Black for `*.py`.
- OpenAI-compatible server dev mode: `bin\openai-server.cmd` (Windows) uses nodemon to watch `src/`, rebuilds via `tsc -p tsconfig.build.json && rollup -c`, then runs the built entry.
- Terminal PATH: before running commands, prepend repository-local executable directories so project tools take precedence:
  - Windows: `bin/`, `node_modules/.bin/`, `venv/Scripts/`, `.venv/Scripts/`, `vendor/bin/`.
  - Linux/macOS: `bin/`, `node_modules/.bin/`, `venv/bin/`, `.venv/bin/`, `vendor/bin/`.
- Filesystem imports: use the default import `import fs from 'fs-extra'`; do not import from `fs` or `node:fs`.
- Path imports: use the default import `import path from 'upath'`; do not import from `path` or `node:path`.
- OpenAI-compatible server architecture and provider details: see `.opencode/memory/openai-compatible.md`.
- Memory rule: after any file edit, create or update a Letta-compatible memory block at `.opencode/memory/<sanitized-filepath>.md` ([block format](https://github.com/joshuadavidthomas/opencode-agent-memory#block-format)).
  - Sanitize the edited file path by replacing `/` and `\` with `_`.
  - Required YAML front-matter:
    - `description`: accurate purpose of the block—the file or feature it tracks.
    - `label`: unique identifier equal to the sanitized filepath.
    - `limit`: character budget; default to `5000`.
    - `read_only: false`: allow future updates.
  - Content: plain prose or bullets covering what changed, why, and any migration notes.
- After changing the OpenAI-compatible server or another AI API integration, update `.opencode/memory/openai-compatible.md`; keep it concise and limited to factual architecture details.
- Staged‑file commit: use `git diff --staged` then generate conventional commit `<type>(<scope>): <subject>`; run `git commit -F tmp/commit.txt`. **Never run `git add` or `git commit` without the user's explicit request.**
- React/TSX guidelines (`*.tsx, *.jsx`): Tailwind utility classes, Flowbite patterns, Font Awesome Pro icons; no CDN tags; PascalCase filenames; functional components default export.
- Python files (`*.py`): PEP 8, Black formatting, type hints, tests with pytest.
- PHP files (`*.php`): PSR‑12, PHP 8.1+, typed properties, PHPDoc for public API.

## AI-Memory guidance

> source code ai-memory at https://github.com/alphaonedev/ai-memory-mcp/tree/main

You have access to a persistent memory system (ai-memory). Follow these rules:
1. RECALL FIRST: At conversation start, call memory_recall with the user's apparent topic. Before answering any question about prior work, recall first.
2. STORE LEARNINGS: When the user corrects you or teaches something, call memory_store with tier:long, priority:9.
3. TOON FORMAT: All recall/list/search responses default to TOON compact (79% smaller than JSON). Pass format:"json" only if you need structured parsing.
4. TIERS: short=6h ephemeral, mid=7d working knowledge, long=permanent. Mid auto-promotes to long at 5 accesses.
5. DEDUP: Storing with an existing title+namespace updates the existing memory, not a duplicate.
6. NAMESPACES: Organize by project/topic. Always pass namespace when storing and recalling.
7. CAPABILITIES: Call memory_capabilities once per session to discover available features (tier-dependent).
8. TAGS: Use tags for cross-cutting concerns. memory_auto_tag can generate them if available. Scope recall to namespace "" when relevant.

### AI-memory workflows
STORE: memory_store(title, content, tier, namespace, tags, priority) — dedup by title+ns
RECALL: memory_recall(context, namespace) → ranked results (TOON compact default)
SEARCH: memory_search(query, namespace) → exact AND match (TOON compact default)
LIST: memory_list(namespace, tier) → browse with filters (TOON compact default)
GET: memory_get(id) → single memory with links
PROMOTE: memory_promote(id) — mid→long, clears expiry
CONSOLIDATE: memory_consolidate(ids, title) — merge N→1, LLM summary if available
LINK: memory_link(source_id, target_id, relation) — related_to|supersedes|contradicts|derived_from|reflects_on
TAG: memory_auto_tag(id) — LLM generates tags (smart+ tier)
EXPAND: memory_expand_query(query) — LLM broadens search terms (smart+ tier)
CONTRADICT: memory_detect_contradiction(id_a, id_b) — LLM checks conflict (smart+ tier)