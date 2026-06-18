---
description: Factual architecture reference for the OpenAI-compatible HTTP server, provider dispatch, compatibility adapters, proxy checker, and persistent runtime files.
label: openai-compatible
limit: 5000
read_only: false
---

- Source: `src/openai-server/`, `src/provider/{opencode,puter,chatgpt}/`, plus related `src/proxy/` and `src/puppeteer/` modules. `dist/` is generated.
- Build and startup:
  - `yarn build` compiles to `tmp/dist`; Rollup emits preserved ESM (`.mjs`) and CommonJS (`.cjs`) modules into `dist`.
  - Start the server with `node dist/openai-server/start.mjs`.
  - It binds to `0.0.0.0`, preferring port `5758` and scanning upward when occupied.
  - State: `tmp/database/openai-server.json`.
  - Logs: `tmp/logs/openai-compatible/server.log`; per-request logs: `tmp/logs/openai-compatible/messages/`, cleared at startup.
  - Startup automatically calls `startProxyChecker()` after the HTTP server begins listening.
- HTTP surface:
  - OpenAI-compatible routes are `GET /v1/models` and `POST /v1/chat/completions`, `/v1/responses`, `/v1/completions`, and `/v1/embeddings`.
  - Proxy-checker routes are `ALL /proxy-checker/start`, `ALL /proxy-checker/stop`, `GET /proxy-checker/status`, and `GET /proxy-checker/logs`.
  - Middleware enables CORS, accepts 50 MB JSON bodies, logs paths/headers, and records but does not validate an optional Bearer token.
- Provider dispatch:
  - `provider/index.ts` dynamically loads the fixed fallback chain `opencode → puter → chatgpt`.
  - `X-Request-Provider` selects one provider with no fallback. Valid names are `opencode`, `puter`, and `chatgpt`; unknown names reach the loader's Puter default branch.
  - `PROVIDER` is only logged at startup; it does not affect dispatch.
  - Providers implement models, chat completions, and Responses API; none implements native legacy completions or embeddings.
  - `/v1/completions` converts the request into a code-autocomplete chat request when no native handler exists.
  - `/v1/embeddings` returns deterministic local hash vectors (384 dimensions by default, maximum 3072); they are not semantic embeddings.
  - `responses-adapter.ts` converts Responses API instructions/input to chat messages and converts chat output/deltas back.
- OpenCode provider:
  - Uses the OpenAI SDK at `https://opencode.ai/zen/v1`; auth comes from `buildOpenAIClient()`/`binary-collections`.
  - The default model is `deepseek-v4-flash-free`; model listing falls back to a static free-model list if the remote list fails.
  - Proxy DB: `tmp/database/opencode-checker.db`; last-working cache: `tmp/database/last-opencode-proxy.txt`.
  - It prefers the cache, then an `opencode.ai` HTTP proxy from SQLite. Requests use Undici `ProxyAgent`; connection failures mark the proxy dead and clear the cache.
- Puter provider:
  - Lazily initializes `@heyputer/puter.js` through `src/provider/puter/get.ts`.
  - Token: `tmp/database/puter.txt`; when absent, `getAuthToken()` fetches and saves it.
  - The default model is `gpt-5-nano`; model `auto` passes no model so Puter chooses its default agent.
  - Models come from a curated static list; streaming consumes `chunk.text`.
- ChatGPT provider:
  - Uses a singleton Puppeteer browser/page from `browser-automation`.
  - Session setup reuses a page already on `chat.openai.com` or `chatgpt.com`; otherwise it navigates there, waits for DOM stability, and requires an existing login.
  - Each request sends only the last user message, so earlier chat messages and system context are not forwarded.
  - Supports full-response and callback streaming; model listing exposes static `gpt-4o` and `gpt-4` entries.
- Proxy checker:
  - Runner order: local TypeScript, local `.mjs`/`.cjs`, installed `.mjs`/`.cjs`, installed TypeScript. TypeScript uses `ts-node/esm`; built JS runs directly.
  - Detached startup uses a token-owned atomic lock; the checker adopts it, writes its PID, and releases it on completion or signals.
  - API startup uses `ProxyCheckerManager`, which owns the child and lock lifecycle.
  - Runtime files: `tmp/logs/proxy-checker.{lock,pid,log}`.
  - It tests remote working proxies over HTTP/SOCKS against `https://opencode.ai/zen/v1/responses` and stores the first success for `opencode.ai` in `tmp/database/opencode-checker.db`.
