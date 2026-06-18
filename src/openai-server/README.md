# ChatGPT OpenAI-Compatible Server

This module provides an OpenAI-compatible API server that uses Puppeteer to interact with ChatGPT's web interface, making it accessible via the standard OpenAI SDK format.

## Features

- ✅ OpenAI-compatible `/v1/chat/completions` endpoint
- ✅ Streaming support (Server-Sent Events)
- ✅ Non-streaming responses
- ✅ Persistent browser session (reuses login between requests)
- ✅ Automatic session management
- ✅ Works with any OpenAI SDK or client

## Architecture

```
Client (OpenAI SDK/curl)
    ↓ HTTP POST
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
curl -X POST http://localhost:5758/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "stream": false
  }'
```

**Streaming:**
```bash
curl -X POST http://localhost:5758/v1/chat/completions \
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
  baseURL: 'http://localhost:5758/v1',
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

## Files

- `src/openai-server/provider/chatgpt.ts` — ChatGPT provider implementation
- `src/openai-server/provider/puter.ts` — Puter provider (default)
- `src/openai-server/server.ts` — Express server with provider routing
- `src/openai-server/start.ts` — Server entry point
- `src/puppeteer/chatgpt/` — ChatGPT automation logic
- `tmp/logs/openai-compatible/server.log` — Server logs
- `tmp/database/openai-server.json` — Server state (port, PID, URL)

## See Also

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference/chat)
- [Puter AI Documentation](https://developer.puter.com/tutorials/free-unlimited-openai-api/)
