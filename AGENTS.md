# AGENTS QUICK REFERENCE

- Monorepo: `packages/*` workspaces, source in `src/` only.
- Build: `yarn install && yarn build` → Rollup then `tsc -p tsconfig.dts.json`.
- Lint/format: run `eslint --fix <files>`; TypeScript check `tsc --noEmit`.
- Test: `yarn test` (Jest) – tests under `test/`; single test via `node --test <file>`.
- Run single TS file: `node --no-warnings=ExperimentalWarning --loader ts-node/esm <file.ts>`.
- OpenAI‑compatible server:
  - Start default (Puter) → `node dist/openai-server/start.mjs`.
  - ChatGPT provider → `PROVIDER=chatgpt node dist/openai-server/start.mjs`.
  - Per‑request override via header `X-Request-Provider` (chatgpt|puter|opencode).
  - Provider index (`src/openai-server/provider/index.ts`) handles fallback chain.
- ChatGPT provider (`src/openai-server/provider/chatgpt.ts`): `getBrowserSession()` now checks `page.url()` and skips navigation when already on a ChatGPT page.
- Puter provider (`src/openai-server/provider/puter.ts`): uses `@heyputer/puter.js`; default model `gpt-5-nano`; 500+ models available.
- `.opencode` memory rule: after any `src/` edit create `.opencode/memory/<sanitized-path>.md` with YAML front‑matter (`description`, `label`, `limit`, `read_only`).
- Staged‑file commit: use `git diff --staged` then generate conventional commit `<type>(<scope>): <subject>`; run `git commit -F commit.txt`.
- React/TSX guidelines (`*.tsx, *.jsx`): Tailwind utility classes, Flowbite patterns, Font Awesome Pro icons; no CDN tags; PascalCase filenames; functional components default export.
- Python files (`*.py`): PEP 8, Black formatting, type hints, tests with pytest.
- PHP files (`*.php`): PSR‑12, PHP 8.1+, typed properties, PHPDoc for public API.
