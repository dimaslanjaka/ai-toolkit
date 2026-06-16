Use this as a full `server.ts`.

It supports:

* `/v1/chat/completions`
* `stream: true`
* `stream: false`
* OpenAI-compatible SSE
* opencode Desktop visible thinking via `reasoning_content`
* 9Router-safe mode using SSE comments only
* retry until success for direct clients
* limited retry when behind 9Router, so 9Router can fallback

9Router exposes an OpenAI-compatible endpoint, so the safest shared format is normal Chat Completions SSE. opencode also supports OpenAI-compatible providers and reasoning content through the AI SDK path. ([9Router][1])

```ts
import express from 'express';
import crypto from 'node:crypto';

const app = express();

app.use(express.json({ limit: '8mb' }));

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | Array<any> | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
};

type ChatCompletionRequest = {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
  [key: string]: any;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function unix() {
  return Math.floor(Date.now() / 1000);
}

function createChatId() {
  return `chatcmpl-${crypto.randomUUID().replaceAll('-', '')}`;
}

function writeSSEData(res: express.Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSSEComment(res: express.Response, text: string) {
  res.write(`: ${text}\n\n`);
}

function createChunk(params: {
  id: string;
  model: string;
  created: number;
  delta: Record<string, unknown>;
  finishReason?: string | null;
}) {
  return {
    id: params.id,
    object: 'chat.completion.chunk',
    created: params.created,
    model: params.model,
    choices: [
      {
        index: 0,
        delta: params.delta,
        logprobs: null,
        finish_reason: params.finishReason ?? null
      }
    ]
  };
}

function createNonStreamResponse(params: {
  id: string;
  model: string;
  content: string;
}) {
  return {
    id: params.id,
    object: 'chat.completion',
    created: unix(),
    model: params.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: params.content
        },
        logprobs: null,
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function createErrorResponse(message: string, code = 'server_error') {
  return {
    error: {
      message,
      type: 'server_error',
      code
    }
  };
}

function isRetryableError(error: any) {
  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status;

  if (!status) return true;

  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function detect9Router(req: express.Request) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  const compat = String(req.headers['x-compat-client'] || req.query.compat || '').toLowerCase();

  return (
    compat === '9router' ||
    ua.includes('9router')
  );
}

function detectOpenCode(req: express.Request) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  const compat = String(req.headers['x-compat-client'] || req.query.compat || '').toLowerCase();

  return (
    compat === 'opencode' ||
    ua.includes('opencode')
  );
}

function shouldSendReasoningStatus(req: express.Request) {
  const is9Router = detect9Router(req);
  const isOpenCode = detectOpenCode(req);

  const explicit =
    req.headers['x-reasoning-status'] === '1' ||
    req.query.reasoning_status === '1';

  return !is9Router && (isOpenCode || explicit);
}

function sanitizeMessagesForUpstream(messages: ChatMessage[] = []) {
  return messages.map(message => {
    const clean: ChatMessage = {
      role: message.role,
      content: message.content ?? ''
    };

    if (message.name) clean.name = message.name;
    if (message.tool_calls) clean.tool_calls = message.tool_calls;
    if (message.tool_call_id) clean.tool_call_id = message.tool_call_id;

    // Intentionally do not forward reasoning_content unless your upstream supports it.
    return clean;
  });
}

async function retryUntilSuccess<T>(options: {
  signal: AbortSignal;
  task: () => Promise<T>;
  maxRetries: number;
  onRetry?: (attempt: number, error: unknown) => void;
}) {
  let attempt = 0;

  while (!options.signal.aborted) {
    try {
      return await options.task();
    } catch (error) {
      attempt++;

      if (!isRetryableError(error) || attempt > options.maxRetries) {
        throw error;
      }

      options.onRetry?.(attempt, error);

      const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 5), 15_000);
      await sleep(delay);
    }
  }

  throw new Error('Request aborted');
}

/**
 * Replace this with your real model call.
 *
 * This function must return final assistant text.
 * Keep it non-streaming internally if your goal is:
 * "retry upstream until success, then send response".
 */
async function generateWithYourProvider(
  body: ChatCompletionRequest,
  signal: AbortSignal
): Promise<string> {
  const messages = sanitizeMessagesForUpstream(body.messages);

  // Example only.
  // Replace with fetch(), axios, SDK call, queue worker, etc.
  await sleep(3000);

  if (signal.aborted) {
    throw new Error('Request aborted');
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find(message => message.role === 'user');

  const text =
    typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage?.content ?? '');

  return `Result: ${text}`;
}

app.post('/v1/chat/completions', async (req, res) => {
  const body = req.body as ChatCompletionRequest;

  const id = createChatId();
  const created = unix();
  const model = body.model || 'local-model';
  const stream = body.stream === true;

  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
  });

  const is9Router = detect9Router(req);
  const showReasoningStatus = shouldSendReasoningStatus(req);

  /**
   * Important:
   * - Direct opencode can retry for a long time.
   * - Behind 9Router should not retry forever.
   *   Let 9Router fallback after a few failures.
   */
  const maxRetries = is9Router ? 2 : Number.POSITIVE_INFINITY;

  if (!stream) {
    try {
      const content = await retryUntilSuccess({
        signal: abortController.signal,
        maxRetries,
        task: () => generateWithYourProvider(body, abortController.signal)
      });

      return res.json(
        createNonStreamResponse({
          id,
          model,
          content
        })
      );
    } catch (error: any) {
      return res
        .status(500)
        .json(createErrorResponse(error?.message || 'Model request failed'));
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.flushHeaders?.();

  // First OpenAI-compatible role chunk.
  writeSSEData(
    res,
    createChunk({
      id,
      model,
      created,
      delta: {
        role: 'assistant',
        content: ''
      }
    })
  );

  // Keep the stream alive while your server is still retrying.
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;

    // Safe for OpenAI-compatible clients and 9Router.
    // It does not become assistant text.
    writeSSEComment(res, 'still-thinking');

    // Optional visible thinking/status for opencode direct.
    // Do not send this through 9Router by default.
    if (showReasoningStatus) {
      writeSSEData(
        res,
        createChunk({
          id,
          model,
          created,
          delta: {
            reasoning_content: 'Still thinking...\n'
          }
        })
      );
    }
  }, 8000);

  try {
    const content = await retryUntilSuccess({
      signal: abortController.signal,
      maxRetries,
      task: () => generateWithYourProvider(body, abortController.signal),
      onRetry(attempt, error: any) {
        if (res.writableEnded) return;

        writeSSEComment(res, `retry-${attempt}`);

        if (showReasoningStatus) {
          writeSSEData(
            res,
            createChunk({
              id,
              model,
              created,
              delta: {
                reasoning_content:
                  `Retrying upstream provider. Attempt ${attempt}. ` +
                  `${error?.message || 'Temporary error'}\n`
              }
            })
          );
        }
      }
    });

    if (abortController.signal.aborted || res.writableEnded) return;

    // Real final assistant text.
    writeSSEData(
      res,
      createChunk({
        id,
        model,
        created,
        delta: {
          content
        }
      })
    );

    // Finish chunk.
    writeSSEData(
      res,
      createChunk({
        id,
        model,
        created,
        delta: {},
        finishReason: 'stop'
      })
    );

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    if (!res.writableEnded && !abortController.signal.aborted) {
      /**
       * For strict OpenAI-compatible streaming, you cannot change HTTP status
       * after streaming started.
       *
       * So send an assistant-visible error and close cleanly.
       */
      writeSSEData(
        res,
        createChunk({
          id,
          model,
          created,
          delta: {
            content:
              `Server failed after retrying upstream provider: ` +
              `${error?.message || 'unknown error'}`
          }
        })
      );

      writeSSEData(
        res,
        createChunk({
          id,
          model,
          created,
          delta: {},
          finishReason: 'stop'
        })
      );

      res.write('data: [DONE]\n\n');
      res.end();
    }
  } finally {
    clearInterval(heartbeat);
  }
});

app.listen(3000, () => {
  console.log('OpenAI-compatible server running at http://127.0.0.1:3000/v1');
});
```

For opencode direct, call it like this:

```text
http://127.0.0.1:3000/v1/chat/completions?compat=opencode
```

For 9Router, use:

```text
http://127.0.0.1:3000/v1/chat/completions?compat=9router
```

Core rule:

```ts
const maxRetries = is9Router ? 2 : Number.POSITIVE_INFINITY;
const showReasoningStatus = !is9Router && isOpenCode;
```

That keeps opencode informed, while still letting 9Router fallback when your upstream keeps failing.

[1]: https://9router.com/?utm_source=chatgpt.com "9Router - Free AI Router | Smart Fallback for Claude, Codex ..."
