import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { serverLogger } from '../utils.js';

// ---- Provider result types ----

export interface ProviderJsonResult {
  type: 'json';
  data: any;
}

export interface ProviderStreamResult {
  type: 'stream';
  pipe: (res: Response) => Promise<void>;
}

export type ProviderResult = ProviderJsonResult | ProviderStreamResult;

type ProviderHandlerName =
  | 'handleModels'
  | 'handleChatCompletion'
  | 'handleResponses'
  | 'handleCompletion'
  | 'handleEmbeddings';

// ---- Fallback chain ----

const FALLBACK_ORDER = ['opencode', 'puter', 'chatgpt'];

function getRequestedProvider(req: Request): string | null {
  const header = req.headers['x-request-provider'];

  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }

  return null;
}

function getProviderCandidates(req: Request): string[] {
  const requested = getRequestedProvider(req);

  if (requested) {
    return [requested]; // Explicit provider only. No fallback.
  }

  return FALLBACK_ORDER;
}

async function loadProviderModule(provider: string) {
  switch (provider) {
    case 'opencode':
      return import('./opencode.js');

    case 'chatgpt':
      return import('./chatgpt.js');

    case 'puter':
    default:
      return import('./puter.js');
  }
}

/**
 * Call a required handler on a provider, with auto-fallback.
 * Throws only if all candidates fail.
 */
async function callWithFallback(req: Request, handlerName: ProviderHandlerName): Promise<ProviderResult> {
  const candidates = getProviderCandidates(req);
  let lastError: any;

  for (const provider of candidates) {
    try {
      const mod = await loadProviderModule(provider);
      const handler = (mod as any)[handlerName];

      if (typeof handler !== 'function') {
        throw new Error(`Provider "${provider}" does not implement ${handlerName}`);
      }

      serverLogger.log(`Calling ${handlerName} on provider: ${provider}`);

      const result: ProviderResult = await handler(req);

      return result;
    } catch (err) {
      lastError = err;

      serverLogger.logSync(`Provider "${provider}" failed for ${handlerName}: ${(err as any)?.message || err}`);
    }
  }

  throw lastError || new Error(`All providers failed for ${handlerName}`);
}

/**
 * Try an optional handler.
 *
 * Returns null when no provider implements the handler.
 * Throws only when a matching provider exists but fails.
 */
async function tryCallWithFallback(req: Request, handlerName: ProviderHandlerName): Promise<ProviderResult | null> {
  const candidates = getProviderCandidates(req);
  let lastError: any;
  let foundHandler = false;

  for (const provider of candidates) {
    try {
      const mod = await loadProviderModule(provider);
      const handler = (mod as any)[handlerName];

      if (typeof handler !== 'function') {
        continue;
      }

      foundHandler = true;

      serverLogger.log(`Calling ${handlerName} on provider: ${provider}`);

      const result: ProviderResult = await handler(req);

      return result;
    } catch (err) {
      lastError = err;

      serverLogger.logSync(`Provider "${provider}" failed for ${handlerName}: ${(err as any)?.message || err}`);
    }
  }

  if (foundHandler && lastError) {
    throw lastError;
  }

  return null;
}

function sendResult(res: Response, result: ProviderResult): void {
  if (result.type === 'stream') {
    result.pipe(res).catch((err) => {
      serverLogger.logSync(`Unhandled stream pipe error: ${err}`);

      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: (err as any)?.message || 'Stream error'
          }
        });
      }
    });

    return;
  }

  res.json(result.data);
}

function createRequestWithBody(req: Request, body: any): Request {
  const nextReq = Object.create(req) as Request;
  (nextReq as any).body = body;
  return nextReq;
}

// ---- OpenAI compatibility helpers ----

function normalizePrompt(prompt: unknown): string {
  if (typeof prompt === 'string') {
    return prompt;
  }

  if (Array.isArray(prompt)) {
    return prompt.map((item) => String(item ?? '')).join('\n');
  }

  if (prompt == null) {
    return '';
  }

  return String(prompt);
}

function normalizeEmbeddingInput(input: unknown): string[] {
  if (typeof input === 'string') {
    return [input];
  }

  if (Array.isArray(input)) {
    return input.map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (Array.isArray(item)) {
        return item.join(' ');
      }

      return String(item ?? '');
    });
  }

  if (input == null) {
    return [''];
  }

  return [String(input)];
}

function normalizeDimensions(value: unknown, fallback = 384): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed < 16) {
    return fallback;
  }

  if (parsed > 3072) {
    return 3072;
  }

  return Math.floor(parsed);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractTextContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (typeof part?.text === 'string') {
          return part.text;
        }

        if (typeof part?.content === 'string') {
          return part.content;
        }

        return '';
      })
      .join('');
  }

  return '';
}

function extractTextFromProviderResult(result: ProviderResult): {
  text: string;
  usage?: any;
  finishReason?: string;
  model?: string;
} {
  if (result.type === 'stream') {
    throw new Error('/v1/completions requires a non-stream provider response');
  }

  const data = result.data;
  const choice = data?.choices?.[0];

  const text = typeof choice?.text === 'string' ? choice.text : extractTextContent(choice?.message?.content);

  return {
    text,
    usage: data?.usage,
    finishReason: choice?.finish_reason,
    model: data?.model
  };
}

/**
 * Compatibility-only embedding fallback.
 *
 * This creates stable numeric vectors.
 * It is valid for API compatibility, but it is not a real semantic embedding model.
 */
function createHashEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9_$.-]+/gi) ?? [];

  for (const token of tokens) {
    const hash = crypto.createHash('sha256').update(token).digest();

    for (let i = 0; i < hash.length; i += 2) {
      const bucket = hash[i] % dimensions;
      const sign = hash[i + 1] % 2 === 0 ? 1 : -1;

      vector[bucket] += sign;
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;

  return vector.map((value) => Number((value / norm).toFixed(8)));
}

function createLocalEmbeddingResponse(body: any) {
  const model = body?.model ?? 'local-embedding';
  const input = normalizeEmbeddingInput(body?.input);
  const dimensions = normalizeDimensions(body?.dimensions, 384);

  const data = input.map((text, index) => ({
    object: 'embedding',
    index,
    embedding: createHashEmbedding(text, dimensions)
  }));

  const promptTokens = input.reduce((sum, item) => sum + estimateTokens(item), 0);

  return {
    object: 'list',
    data,
    model,
    usage: {
      prompt_tokens: promptTokens,
      total_tokens: promptTokens
    }
  };
}

// ---- Exported Express handlers ----

export async function handleModels(req: Request, res: Response) {
  try {
    const result = await callWithFallback(req, 'handleModels');
    sendResult(res, result);
  } catch (err) {
    res.status(500).json({
      error: {
        message: (err as any)?.message || 'All providers failed'
      }
    });
  }
}

export async function handleChatCompletion(req: Request, res: Response) {
  try {
    const result = await callWithFallback(req, 'handleChatCompletion');
    sendResult(res, result);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: (err as any)?.message || 'All providers failed'
        }
      });
    }
  }
}

/**
 * OpenAI-compatible /v1/completions endpoint.
 *
 * Used by VSCode autocomplete / inline suggestions.
 *
 * This first tries provider.handleCompletion if available.
 * If unavailable, it converts the legacy completion request into a chat completion request.
 */
export async function handleCompletion(req: Request, res: Response) {
  try {
    const nativeResult = await tryCallWithFallback(req, 'handleCompletion');

    if (nativeResult) {
      sendResult(res, nativeResult);
      return;
    }

    const body = req.body ?? {};
    const model = body.model ?? 'local-completion';
    const prompt = normalizePrompt(body.prompt);
    const created = Math.floor(Date.now() / 1000);
    const isStream = body.stream === true || body.stream === 'true';

    const chatBody = {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a code autocomplete engine. Return only the missing code continuation. Do not explain. Do not use markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: body.max_tokens ?? body.max_completion_tokens ?? 128,
      temperature: body.temperature ?? 0.2,
      top_p: body.top_p,
      stop: body.stop,
      stream: isStream
    };

    // Streaming support for VSCode inline suggestions
    if (isStream) {
      const chatReqStream = createRequestWithBody(req, chatBody);
      const streamResult = await callWithFallback(chatReqStream, 'handleChatCompletion');

      if (streamResult.type === 'stream') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        await streamResult.pipe(res);

        // Note: The pipe already handles streaming.
        // If provider returns JSON with stream wrapper, convert here.
        return;
      }

      // Fallback: convert JSON stream result to completion format
      const extracted = extractTextFromProviderResult(streamResult);
      const text = extracted.text ?? '';

      res.json({
        id: `cmpl-${crypto.randomUUID()}`,
        object: 'text_completion',
        created,
        model: extracted.model ?? model,
        choices: [
          {
            text,
            index: 0,
            logprobs: null,
            finish_reason: extracted.finishReason ?? 'stop'
          }
        ],
        usage: extracted.usage ?? {
          prompt_tokens: estimateTokens(prompt),
          completion_tokens: estimateTokens(text),
          total_tokens: estimateTokens(prompt) + estimateTokens(text)
        }
      });
      return;
    }

    const chatReq = createRequestWithBody(req, chatBody);
    const chatResult = await callWithFallback(chatReq, 'handleChatCompletion');
    const extracted = extractTextFromProviderResult(chatResult);

    const text = extracted.text ?? '';
    const usage = extracted.usage ?? {
      prompt_tokens: estimateTokens(prompt),
      completion_tokens: estimateTokens(text),
      total_tokens: estimateTokens(prompt) + estimateTokens(text)
    };

    res.json({
      id: `cmpl-${crypto.randomUUID()}`,
      object: 'text_completion',
      created,
      model: extracted.model ?? model,
      choices: [
        {
          text,
          index: 0,
          logprobs: null,
          finish_reason: extracted.finishReason ?? 'stop'
        }
      ],
      usage
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: (err as any)?.message || 'Completion failed',
          type: 'server_error',
          code: 'completion_failed'
        }
      });
    }
  }
}

/**
 * OpenAI-compatible /v1/embeddings endpoint.
 *
 * First tries provider.handleEmbeddings if available.
 * If unavailable, returns local hash embeddings for compatibility.
 */
export async function handleEmbeddings(req: Request, res: Response) {
  try {
    const providerResult = await tryCallWithFallback(req, 'handleEmbeddings');

    if (providerResult) {
      sendResult(res, providerResult);
      return;
    }

    res.json(createLocalEmbeddingResponse(req.body ?? {}));
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: (err as any)?.message || 'Embedding failed',
          type: 'server_error',
          code: 'embedding_failed'
        }
      });
    }
  }
}

export async function handleResponses(req: Request, res: Response) {
  try {
    const result = await callWithFallback(req, 'handleResponses');
    sendResult(res, result);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: (err as any)?.message || 'All providers failed'
        }
      });
    }
  }
}
