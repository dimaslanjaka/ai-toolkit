# ChatGPT OpenAI-Compatible Server

This module provides an OpenAI-compatible API server that uses Puppeteer to interact with ChatGPT's web interface, making it accessible via the standard OpenAI SDK format.

## Features

- ✅ OpenAI-compatible `/v1/chat/completions` endpoint
- ✅ Streaming support (Server-Sent Events)
- ✅ Non-streaming responses
- ✅ Persistent browser session (reuses login between requests)
- ✅ Automatic session management
- ✅ Works with any OpenAI SDK or client
- ✅ RTK Token Saver for tool output compression (20-40% token savings, optional)

## Architecture

```
Client (OpenAI SDK/curl)
    ↓ HTTPS POST
Express Server (/v1/chat/completions)
    ↓
Puppeteer Browser (persistent session)
    ↓
ChatGPT Web Interface (chat.openai.com)
    ↓
Stream response chunks back as OpenAI SSE format
```

## Prerequisites

1. **Node.js** 18+
2. **Chrome/Chromium** installed (for Puppeteer)
3. **ChatGPT account** (free or Plus)

## Installation

```bash
yarn install
yarn build
```

## Usage

### Web chat frontend

Start the API server and Vite frontend in separate terminals during development:

```bash
yarn dev:web
node dist/openai-server/start.mjs
```

Run `yarn dev:web` first at least once so `vite-plugin-mkcert` generates the shared
certificate files. Vite then serves the chat at `https://localhost:5173/chat/`, and
the Express server listens at `https://localhost:5758`.

The frontend selects its API backend in this order:

1. API base URL saved in the chat settings.
2. `VITE_BACKEND_HOSTNAME_DEV` while running the Vite development server.
3. `VITE_BACKEND_HOSTNAME_PROD` in a production build.
4. The current browser origin.

Typical local-domain configuration:

```dotenv
VITE_HOSTNAME=dev.webmanajemen.com
VITE_PORT=5173
VITE_BACKEND_HOSTNAME_DEV=127.0.0.1:5758
VITE_BACKEND_HOSTNAME_PROD=sh.webmanajemen.com
OPENAI_SERVER_HTTPS=true
OPENAI_SERVER_HTTPS_KEY_FILE=.cert/dev.pem
OPENAI_SERVER_HTTPS_CERT_FILE=.cert/cert.pem
```

The URL builder dynamically prepends `window.location.protocol` to the selected
hostname. An HTTPS page therefore uses `https://127.0.0.1:5758/v1/*` in development
and `https://sh.webmanajemen.com/v1/*` in production. The Vite proxy target is also
derived from `VITE_BACKEND_HOSTNAME_DEV`, using the same protocol selected by
`OPENAI_SERVER_HTTPS` when the hostname has no protocol.

For production, `yarn build` creates the frontend in `dist/openai-server/frontend/`.
The Express server then serves it at `https://localhost:5758/chat/` and redirects `/`
to that route.

Set `OPENAI_SERVER_HTTPS=false` to run both the Vite development server and Express
over HTTP. The certificate directory is ignored by Git and must not be committed.

### 1. Start the server with ChatGPT provider

```bash
# Set PROVIDER environment variable to 'chatgpt'
PROVIDER=chatgpt node dist/openai-server/start.mjs
```

**On Windows (PowerShell):**
```powershell
$env:PROVIDER="chatgpt"
node dist/openai-server/start.mjs
```

**On Windows (cmd):**
```cmd
set PROVIDER=chatgpt
node dist/openai-server/start.mjs
```

The server will:
- Start on port `5758` (or next available port)
- Open a browser window to ChatGPT
- Wait for you to log in (if not already logged in)
- Keep the browser open for subsequent requests

### 2. Test with curl

**Non-streaming:**
```bash
curl -X POST https://localhost:5758/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "stream": false
  }'
```

**Streaming:**
```bash
curl -X POST https://localhost:5758/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Tell me a joke"}],
    "stream": true
  }'
```

### 3. Use with OpenAI SDK

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://localhost:5758/v1',
  apiKey: 'dummy-key' // Any string works
});

// Non-streaming
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the capital of France?' }]
});

console.log(response.choices[0].message.content);

// Streaming
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### 4. Run the demo

```bash
# Start server in one terminal
PROVIDER=chatgpt node dist/openai-server/start.mjs

# Run demo in another terminal
node dist/openai-server/chatgpt-demo.mjs
```

## Configuration

### Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `PROVIDER` | `puter` or `chatgpt` | `puter` | Which AI provider to use |
| `OPENAI_SERVER_HTTPS` | `true` or `false` | `true` | Enable shared HTTPS for Vite and Express |
| `OPENAI_SERVER_HTTPS_KEY_FILE` | File path | `.cert/dev.pem` | mkcert private-key path |
| `OPENAI_SERVER_HTTPS_CERT_FILE` | File path | `.cert/cert.pem` | mkcert certificate path |
| `RTK_ENABLED` | `true` or `false` | `false` | Enable RTK token compression for tool output |

### Switching Providers

**Use Puter (default, 500+ models):**
```bash
node dist/openai-server/start.mjs
# or explicitly
PROVIDER=puter node dist/openai-server/start.mjs
```

**Use ChatGPT (Puppeteer automation):**
```bash
PROVIDER=chatgpt node dist/openai-server/start.mjs
```

## How It Works

### Session Management

1. **First request**: Opens browser, navigates to ChatGPT, waits for login
2. **Subsequent requests**: Reuses the same browser session
3. **Session persistence**: Browser stays open until server shutdown

### Streaming Flow

1. Client sends POST to `/v1/chat/completions` with `stream: true`
2. Server writes question to ChatGPT textarea
3. Server clicks submit button
4. Server watches DOM for `[data-message-author-role="assistant"]` elements
5. As text chunks appear in DOM, server yields them
6. Each chunk is formatted as OpenAI SSE: `data: {...}\n\n`
7. Final chunk sent: `data: [DONE]\n\n`

### Non-Streaming Flow

1. Same as streaming, but accumulates all chunks
2. Returns full response in one JSON object

## Limitations

- **Single concurrent request**: Only 1 request at a time (local dev only)
- **DOM-dependent**: Breaks if ChatGPT changes their HTML structure
- **Slower than API**: Browser automation adds ~2-5s latency
- **No message history**: Only sends the last user message (no conversation context)
- **Login required**: Must manually log in on first run
- **Browser overhead**: Uses ~200-400MB RAM for browser instance

## Troubleshooting

### Browser doesn't open
- Ensure Chrome/Chromium is installed
- Try: `yarn add puppeteer --force`

### "ChatGPT login required" error
- Log in manually in the opened browser window
- Cookies are saved for future sessions

### DOM selector errors
- ChatGPT may have updated their UI
- Check `src/puppeteer/chatgpt/` for selector updates

### Port already in use
- Server automatically finds next available port
- Check logs: `tmp/logs/openai-compatible/server.log`

## Token Optimization: RTK Token Saver

When enabled, RTK (Rust Token Killer) compresses tool output to reduce token usage by 20-40%, lowering API costs and improving response latency.

### Setup

1. **Install RTK binary:**
   ```bash
   node scripts/rtk-installer.js
   ```
   This downloads the RTK binary to `node_modules/.bin/rtk` (or `rtk.exe` on Windows).

2. **Enable in environment:**
   ```dotenv
   RTK_ENABLED=true
   ```

### How It Works

When a tool executes and returns output, RTK compresses it intelligently:
- Only compresses outputs >100 characters (skips tiny results)
- Uses context hints (tool name) for better compression
- Falls back gracefully if RTK unavailable or compression fails
- Never breaks the request—original output used if compression fails

Example in logs:
```
[RTK] git_diff: saved ~250 tokens (1200 → 950)
[RTK] grep_search: saved ~80 tokens (480 → 400)
```

### Requirements

- Node.js with `node_modules/.bin/` in PATH (automatic after install)
- RTK binary: https://github.com/rtk-ai/rtk
- Timeout: 5 seconds per compression (configurable in code)

### Disable

Set `RTK_ENABLED=false` or omit the variable to skip compression.

## Files

- `src/openai-server/provider/chatgpt.ts` — ChatGPT provider implementation
- `src/openai-server/provider/puter.ts` — Puter provider (default)
- `src/openai-server/provider/opencode.ts` — OpenCode provider
- `src/openai-server/server.ts` — Express server with provider routing
- `src/openai-server/start.ts` — Server entry point
- `src/openai-server/rtk-saver.ts` — RTK token compression integration
- `src/openai-server/tools/tool-registry.ts` — Tool execution and RTK compression
- `src/puppeteer/chatgpt/` — ChatGPT automation logic
- `scripts/rtk-installer.js` — RTK binary installer
- `tmp/logs/openai-compatible/server.log` — Server logs
- `tmp/database/openai-server.json` — Server state (port, PID, URL)

## See Also

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference/chat)
- [Puter AI Documentation](https://developer.puter.com/tutorials/free-unlimited-openai-api/)
