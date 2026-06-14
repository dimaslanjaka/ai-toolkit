# OpenAI-Compatible Server (Puter Wrapper)

This module exposes a REST API that mirrors OpenAI's chat completion endpoint, translating requests to Puter's SDK and responses back to OpenAI format.

## Usage

```bash
node dist/openai-server/start.mjs
```

The server automatically finds a free port (starting from 5758) and saves its state to `tmp/data/openai-server.json`.

### Programmatic Usage

```typescript
import { app, startServer, getServerState } from '@dimaslanjaka/ai-toolkit';

// Auto-find free port and save state
const state = await startServer(app, 5758);
console.log(`Running on ${state.url}`);

// Later, retrieve the saved state
const saved = getServerState();
```

## API Endpoint

`POST /v1/chat/completions`

### Request Body (Subset of OpenAI format)

```json
{
  "model": "gpt-5-nano",
  "messages": [
    { "role": "user", "content": "Explain quantum computing." }
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

### Response (Non-Streaming)

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1718362070,
  "model": "gpt-5-nano",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Quantum computing uses quantum mechanics..."
      },
      "finish_reason": "stop"
    }
  ]
}
```

### Response (Streaming)

When `stream: true`, the server returns Server-Sent Events (SSE):

```
data: {"choices":[{"delta":{"content":"Quantum"}}]}

data: {"choices":[{"delta":{"content":" computing"}}]}

data: [DONE]
```

## Available Models

Puter supports 500+ models from 50+ providers. Some common ones:

- `gpt-5-nano` (default)
- `gpt-5.5`, `gpt-5.4-mini`, `gpt-5.2-chat`
- `claude-opus-4-8`, `claude-sonnet-4-5`, `claude-haiku-4.5`
- `gemini-2.5-flash`, `gemini-2.5-flash-lite`
- `deepseek-v4-pro`, `deepseek-v4-flash`
- And many more (use `puter.ai.listModels()` to see all)

## Server State

When started, the server saves its state to `tmp/data/openai-server.json`:

```json
{
  "port": 5758,
  "pid": 12345,
  "startedAt": "2026-06-14T12:00:00.000Z",
  "url": "http://localhost:5758"
}
```

Use `getServerState()` from `utils.ts` to read it programmatically.

## Utility Functions (`utils.ts`)

| Function | Description |
|---|---|
| `findFreePort(preferredPort)` | Auto-finds the next available port |
| `saveServerState(state)` | Persists server state to disk |
| `getServerState()` | Reads saved server state |
| `startServer(app, preferredPort)` | Starts server on free port, saves state, returns state |

## Implementation Notes

- **Simple Prompt Construction**: Messages are concatenated with role prefixes. This is a basic approach; for production use, consider more sophisticated message formatting.
- **Lazy Loading**: The Puter provider is lazily initialized on first request to avoid token prompts at startup.
- **Streaming**: Uses Server-Sent Events for streaming responses, matching OpenAI's format.
- **Error Handling**: Errors return HTTP 500 with an OpenAI-compatible error object.
- **Auto Port Finding**: The server finds a free port automatically if the preferred port is taken.

## Example Client Usage

Using the OpenAI Node.js SDK against this server:

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'not-needed',
  baseURL: 'http://localhost:5758',
});

const response = await client.chat.completions.create({
  model: 'claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response.choices[0].message.content);
```
