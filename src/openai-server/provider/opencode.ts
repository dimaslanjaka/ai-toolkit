import { Request } from 'express';
import type OpenAI from 'openai';
import {
  convertChatCompletionsToResponses,
  convertResponsesRequestToChatCompletions,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';
import { logMessageToFile, appendMessageToFile, serverLogger } from '../utils.js';
import type { ProviderResult } from './index.js';

// Lazy-load the OpenCode provider to avoid SDK init at import time
let opencodeClient: OpenAI | null = null;
async function getOpenCode(): Promise<OpenAI> {
  if (!opencodeClient) {
    const { opencodeProvider } = await import('../../provider/opencode/get.js');
    opencodeClient = await opencodeProvider();
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
    const client = await getOpenCode();
    const models = await client.models.list();
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

  if (stream) {
    return {
      type: 'stream',
      pipe: async (res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();

        let fullResponse = '';
        try {
          const streamResponse = await client.chat.completions.create({
            ...baseBody,
            stream: true as const
          });
          for await (const chunk of streamResponse) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullResponse += delta;
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
            }
          }
          res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
          res.write('data: [DONE]\n\n');
          appendMessageToFile(logFile, 'OPENCODE STREAMING RESPONSE', fullResponse);
        } catch (streamErr: any) {
          serverLogger.logSync(`OpenCode streaming error: ${streamErr}`);
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  const completion = await client.chat.completions.create({
    ...baseBody,
    stream: false as const
  });
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
          const streamResponse = await client.chat.completions.create({
            ...baseBody,
            stream: true as const
          });
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
          res.write(
            `data: ${JSON.stringify({ type: 'response.done', response: { id: responseId, status: 'completed' } })}\n\n`
          );
          res.write('data: [DONE]\n\n');
          appendMessageToFile(responsesLogFile, 'OPENCODE RESPONSES STREAMING RESPONSE', fullResponse);
        } catch (streamErr: any) {
          serverLogger.logSync(`OpenCode Responses streaming error: ${streamErr}`);
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  const completion = await client.chat.completions.create({
    ...baseBody,
    stream: false as const
  });
  const content = completion.choices?.[0]?.message?.content || '';
  appendMessageToFile(responsesLogFile, 'OPENCODE RESPONSES RESPONSE', content);

  const chatCompletionsFormat = {
    model: requestData.model,
    choices: [{ message: { role: 'assistant', content } }]
  };
  const result = convertChatCompletionsToResponses(chatCompletionsFormat, requestData.model);
  return { type: 'json', data: result };
}
