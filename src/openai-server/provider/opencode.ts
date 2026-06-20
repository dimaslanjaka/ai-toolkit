import { Request } from 'express';
import fs from 'fs-extra';
import type OpenAI from 'openai';
import { isEmpty, writefile } from 'sbg-utility';
import { ProxyAgent } from 'undici';
import path from 'upath';
import SQLiteProxy from '../../database/SQLiteProxy.js';
import { getSharedModels } from '../../database/shared.js';
import { OPENCODE_PROXY_DB_PATH } from '../../proxy/opencode-checker.js';
import {
  convertChatCompletionsToResponses,
  convertResponsesRequestToChatCompletions,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';
import { appendMessageToFile, logMessageToFile, serverLogger } from '../utils.js';
import type { ProviderResult } from './index.js';

// Lazy-load the OpenCode provider to avoid SDK init at import time
let opencodeClient: OpenAI | null = null;
let opencodeClientProxy: string | undefined;
const LAST_OPENCODE_PROXY_PATH = path.join(process.cwd(), 'tmp', 'database', 'last-opencode-proxy.txt');
const proxyDb = new SQLiteProxy({
  db_type: 'sqlite',
  sqlite_filename: OPENCODE_PROXY_DB_PATH
});

function getProxyUrl(item: {
  password?: string | null;
  proxy: string;
  type?: string | null;
  username?: string | null;
}): string {
  let protocol = item.type?.split(/,-/)[0];
  if (isEmpty(protocol)) protocol = 'http';
  return `${protocol}://${item.username ? `${item.username}:${item.password}@` : ''}${item.proxy}`;
}

function getProxyLabel(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.hostname}:${parsed.port}`;
  } catch {
    return proxyUrl;
  }
}

async function readLastWorkingProxy(): Promise<string | undefined> {
  try {
    const proxyUrl = (await fs.readFile(LAST_OPENCODE_PROXY_PATH, 'utf8')).trim();
    if (!proxyUrl) return undefined;

    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    serverLogger.log(`Reusing cached OpenCode proxy: ${getProxyLabel(proxyUrl)}`);
    return proxyUrl;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      serverLogger.logSync(`Unable to read cached OpenCode proxy: ${error}`);
    }
    return undefined;
  }
}

async function selectProxyUrl(): Promise<string | undefined> {
  const cachedProxy = await readLastWorkingProxy();
  if (cachedProxy) return cachedProxy;

  const item = await proxyDb.getProxyForHost('opencode.ai', { type: 'http' });
  return item ? getProxyUrl(item) : undefined;
}

async function cacheWorkingProxy(proxyUrl: string | undefined): Promise<void> {
  if (!proxyUrl) return;

  try {
    writefile(LAST_OPENCODE_PROXY_PATH, `${proxyUrl}\n`);
    serverLogger.log(`Cached working OpenCode proxy: ${getProxyLabel(proxyUrl)}`);
  } catch (error) {
    serverLogger.logSync(`Unable to cache working OpenCode proxy: ${error}`);
  }
}

async function getOpenCode(): Promise<OpenAI> {
  if (!opencodeClient) {
    const { opencodeProvider } = await import('../../provider/opencode/get.js');
    await proxyDb.initialize();

    // Filter for HTTP proxies only since undici ProxyAgent doesn't support SOCKS5.
    opencodeClientProxy = await selectProxyUrl();

    opencodeClient = await opencodeProvider({
      model: 'deepseek-v4-flash-free',
      provider: 'opencode',
      proxy: opencodeClientProxy
    });
  }
  return opencodeClient;
}

export const OPENCODE_MODEL_LIST = [
  // Free models (opencode.ai/zen/v1 with apiKey='public')
  { id: 'deepseek-v4-flash-free', provider: 'opencode' },
  { id: 'big-pickle', provider: 'opencode' },
  { id: 'mimo-v2.5-free', provider: 'opencode' },
  { id: 'qwen3.6-plus-free', provider: 'opencode' },
  { id: 'minimax-m3-free', provider: 'opencode' },
  { id: 'nemotron-3-ultra-free', provider: 'opencode' },
  { id: 'north-mini-code-free', provider: 'opencode' }
];

export async function handleModels(_req: Request): Promise<ProviderResult> {
  try {
    const modelDb = getSharedModels();
    await modelDb.initialize();

    const modelsApi = await modelDb.models();
    const dbModels = await modelsApi.find({ provider: 'opencode' });

    if (dbModels.length > 0) {
      const data = dbModels.map((model: any) => ({
        id: model.id,
        object: model.object,
        created: model.created,
        owned_by: model.owned_by,
        permission: JSON.parse(model.permission),
        root: model.root,
        parent: model.parent,
        enabled: model.enabled !== 0
      }));
      return { type: 'json', data: { object: 'list', data } };
    }
  } catch {
    // Fall through to API call if database fetch fails
  }

  try {
    const client = await getOpenCode();
    const models = await client.models.list();
    await cacheWorkingProxy(opencodeClientProxy);
    const data = models.data.map((m: any) => ({
      id: m.id,
      object: 'model',
      created: m.created || 1718380395,
      owned_by: m.owned_by || 'opencode',
      permission: [],
      root: m.id,
      parent: null
    }));
    return { type: 'json', data: { object: 'list', data } };
  } catch {
    // Fallback to static model list if API call fails
    const data = OPENCODE_MODEL_LIST.map((model) => ({
      id: model.id,
      object: 'model',
      created: 1718380395,
      owned_by: model.provider,
      permission: [],
      root: model.id,
      parent: null
    }));
    return { type: 'json', data: { object: 'list', data } };
  }
}

function resolveModel(model: string | undefined): string {
  // If caller passes undefined or 'auto', pick a random model from the provider list
  if (!model || model === 'auto') {
    // const randomIdx = Math.floor(Math.random() * OPENCODE_MODEL_LIST.length);
    // return OPENCODE_MODEL_LIST[randomIdx].id;
    // make deepsek by default
    return 'deepseek-v4-flash-free';
  }
  return model;
}

function isConnectionError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code || '';

  // Check for connection-related error indicators
  return (
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ENETUNREACH'
  );
}

async function markProxyDeadSafely(proxyUrl: string): Promise<void> {
  try {
    // Extract proxy address from URL (remove protocol and auth)
    const url = new URL(proxyUrl);
    const proxyAddress = `${url.hostname}:${url.port}`;

    await proxyDb.markProxyDead(proxyAddress);
    serverLogger.log(`Marked dead proxy: ${getProxyLabel(proxyUrl)}`);

    // Clear the cached proxy file since it's no longer working
    try {
      await fs.unlink(LAST_OPENCODE_PROXY_PATH);
    } catch {
      // File may not exist, which is fine
    }
  } catch (error) {
    serverLogger.logSync(`Failed to mark proxy dead: ${error}`);
  }
}

async function createProxyDispatcher(): Promise<{ dispatcher?: ProxyAgent; proxyUrl?: string }> {
  const proxyUrl = await selectProxyUrl();
  return {
    dispatcher: proxyUrl ? new ProxyAgent(proxyUrl) : undefined,
    proxyUrl
  };
}

export async function handleChatCompletion(req: Request): Promise<ProviderResult> {
  const { model, messages, stream, temperature, max_tokens } = req.body as any;
  const resolvedModel = resolveModel(model);

  const promptPreview = (messages || [])
    .map((m: any) => `${m.role}: ${(m.content || '').toString().substring(0, 80)}`)
    .join(' | ');
  serverLogger.log(`OpenCode Chat - Model: ${resolvedModel}, Stream: ${!!stream}, Messages: ${promptPreview}`);
  const logFile = logMessageToFile(
    'OPENCODE REQUEST',
    JSON.stringify({ model: resolvedModel, messages, stream, temperature, max_tokens }, null, 2)
  );

  const client = await getOpenCode();
  const baseBody = {
    model: resolvedModel,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    temperature,
    max_tokens
  };

  const { dispatcher, proxyUrl } = await createProxyDispatcher();

  if (stream) {
    return {
      type: 'stream',
      pipe: async (res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();

        let fullResponse = '';
        try {
          const streamResponse = await client.chat.completions.create(
            {
              ...baseBody,
              stream: true as const
            },
            { fetchOptions: { dispatcher } }
          );
          for await (const chunk of streamResponse) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullResponse += delta;
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
            }
          }
          await cacheWorkingProxy(proxyUrl);
          res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
          res.write('data: [DONE]\n\n');
          appendMessageToFile(logFile, 'OPENCODE STREAMING RESPONSE', fullResponse);
        } catch (streamErr: any) {
          serverLogger.logSync(`OpenCode streaming error: ${streamErr}`);
          // Mark proxy as dead on connection error
          if (proxyUrl && isConnectionError(streamErr)) {
            await markProxyDeadSafely(proxyUrl);
          }
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  try {
    const completion = await client.chat.completions.create(
      {
        ...baseBody,
        stream: false as const
      },
      { fetchOptions: { dispatcher } }
    );
    await cacheWorkingProxy(proxyUrl);
    const content = completion.choices?.[0]?.message?.content || '';
    appendMessageToFile(logFile, 'OPENCODE RESPONSE', content);

    return {
      type: 'json',
      data: {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model ?? 'opencode-default',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: completion.usage || {}
      }
    };
  } catch (err: any) {
    serverLogger.logSync(`OpenCode chat completion error: ${err}`);
    // Mark proxy as dead on connection error
    if (proxyUrl && isConnectionError(err)) {
      await markProxyDeadSafely(proxyUrl);
    }
    throw err;
  }
}

export async function handleResponses(req: Request): Promise<ProviderResult> {
  const requestData = req.body as ResponsesRequest;
  const chatReq = convertResponsesRequestToChatCompletions(requestData);
  const { model, messages, stream, temperature, max_tokens } = chatReq;
  const resolvedModel = resolveModel(model);

  const promptPreview = (messages || [])
    .map((m: any) => `${m.role}: ${(m.content || '').toString().substring(0, 80)}`)
    .join(' | ');
  serverLogger.log(`OpenCode Responses - Model: ${resolvedModel}, Stream: ${!!stream}, Messages: ${promptPreview}`);
  const responsesLogFile = logMessageToFile('OPENCODE RESPONSES REQUEST', JSON.stringify(requestData, null, 2));

  const client = await getOpenCode();
  const baseBody = {
    model: resolvedModel,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    temperature,
    max_tokens
  };
  const { dispatcher, proxyUrl } = await createProxyDispatcher();

  if (stream) {
    return {
      type: 'stream',
      pipe: async (res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();

        const responseId = `resp_${Date.now()}`;
        res.write(
          `data: ${JSON.stringify({
            type: 'response.created',
            response: { id: responseId, object: 'response', status: 'in_progress', model: model || 'opencode-default' }
          })}\n\n`
        );

        let fullResponse = '';
        try {
          const streamResponse = await client.chat.completions.create(
            {
              ...baseBody,
              stream: true as const
            },
            { fetchOptions: { dispatcher } }
          );
          for await (const chunk of streamResponse) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullResponse += delta;
              const deltaPayload = convertStreamingChunkToResponses({
                id: responseId,
                choices: [{ delta: { content: delta } }]
              });
              res.write(`data: ${JSON.stringify(deltaPayload)}\n\n`);
            }
          }
          await cacheWorkingProxy(proxyUrl);
          res.write(
            `data: ${JSON.stringify({ type: 'response.done', response: { id: responseId, status: 'completed' } })}\n\n`
          );
          res.write('data: [DONE]\n\n');
          appendMessageToFile(responsesLogFile, 'OPENCODE RESPONSES STREAMING RESPONSE', fullResponse);
        } catch (streamErr: any) {
          serverLogger.logSync(`OpenCode Responses streaming error: ${streamErr}`);
          // Mark proxy as dead on connection error
          if (proxyUrl && isConnectionError(streamErr)) {
            await markProxyDeadSafely(proxyUrl);
          }
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  try {
    const completion = await client.chat.completions.create(
      {
        ...baseBody,
        stream: false as const
      },
      { fetchOptions: { dispatcher } }
    );
    await cacheWorkingProxy(proxyUrl);
    const content = completion.choices?.[0]?.message?.content || '';
    appendMessageToFile(responsesLogFile, 'OPENCODE RESPONSES RESPONSE', content);

    const chatCompletionsFormat = {
      model: requestData.model,
      choices: [{ message: { role: 'assistant', content } }]
    };
    const result = convertChatCompletionsToResponses(chatCompletionsFormat, requestData.model);
    return { type: 'json', data: result };
  } catch (err: any) {
    serverLogger.logSync(`OpenCode Responses completion error: ${err}`);
    // Mark proxy as dead on connection error
    if (proxyUrl && isConnectionError(err)) {
      await markProxyDeadSafely(proxyUrl);
    }
    throw err;
  }
}
