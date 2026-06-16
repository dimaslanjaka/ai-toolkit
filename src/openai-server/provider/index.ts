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

// ---- Fallback chain ----

const FALLBACK_ORDER = ['puter', 'opencode', 'chatgpt'];

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
    return [requested]; // Explicit provider only — no fallback
  }
  return FALLBACK_ORDER; // Full fallback chain
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
 * Call a handler on a provider, with auto-fallback.
 * Throws only if ALL candidates fail.
 */
async function callWithFallback(
  req: Request,
  handlerName: 'handleModels' | 'handleChatCompletion' | 'handleResponses'
): Promise<ProviderResult> {
  const candidates = getProviderCandidates(req);
  let lastError: any;

  for (const provider of candidates) {
    try {
      const mod = await loadProviderModule(provider);
      serverLogger.log(`Calling ${handlerName} on provider: ${provider}`);
      const result: ProviderResult = await (mod as any)[handlerName](req);
      return result;
    } catch (err) {
      lastError = err;
      serverLogger.logSync(`Provider "${provider}" failed for ${handlerName}: ${(err as any)?.message || err}`);
      // Continue to next provider
    }
  }

  throw lastError || new Error(`All providers failed for ${handlerName}`);
}

function sendResult(res: Response, result: ProviderResult): void {
  if (result.type === 'stream') {
    // pipe is responsible for its own error handling (headers may already be sent)
    result.pipe(res).catch((err) => {
      serverLogger.logSync(`Unhandled stream pipe error: ${err}`);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: (err as any)?.message || 'Stream error' } });
      }
    });
  } else {
    res.json(result.data);
  }
}

// ---- Exported Express handlers ----

export async function handleModels(req: Request, res: Response) {
  try {
    const result = await callWithFallback(req, 'handleModels');
    sendResult(res, result);
  } catch (err) {
    res.status(500).json({ error: { message: (err as any)?.message || 'All providers failed' } });
  }
}

export async function handleChatCompletion(req: Request, res: Response) {
  try {
    const result = await callWithFallback(req, 'handleChatCompletion');
    sendResult(res, result);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: { message: (err as any)?.message || 'All providers failed' } });
    }
  }
}

export async function handleResponses(req: Request, res: Response) {
  try {
    const result = await callWithFallback(req, 'handleResponses');
    sendResult(res, result);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: { message: (err as any)?.message || 'All providers failed' } });
    }
  }
}
