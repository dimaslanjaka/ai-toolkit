import { Request } from 'express';
import { getSharedModels } from '../../database/shared.js';
import {
  convertChatCompletionsToResponses,
  convertResponsesRequestToChatCompletions,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';
import { appendMessageToFile, logMessageToFile, serverLogger } from '../utils.js';
import type { ProviderResult } from './index.js';

// Lazy-load the Puter provider to avoid token prompts at import time
let puterInstance: any;
async function getPuter() {
  if (!puterInstance) {
    const { puterProvider } = await import('../../provider/puter/get.js');
    puterInstance = await puterProvider();
  }
  return puterInstance;
}

/**
 * Handle listing models for Puter provider.
 */
export async function handleModels(_req: Request): Promise<ProviderResult> {
  const modelDb = await getSharedModels();
  await modelDb.initialize();

  const modelsApi = await modelDb.models();
  const dbModels = await modelsApi.find({ provider: 'puter' });

  const openaiModels = dbModels.map((model: any) => ({
    id: model.id,
    object: model.object,
    created: model.created,
    owned_by: model.owned_by,
    permission: JSON.parse(model.permission),
    root: model.root,
    parent: model.parent,
    enabled: model.enabled !== 0
  }));

  return {
    type: 'json',
    data: {
      object: 'list',
      data: openaiModels
    }
  };
}

/**
 * Handle chat completion for Puter provider.
 */
export async function handleChatCompletion(req: Request): Promise<ProviderResult> {
  const { model, messages, stream, temperature, max_tokens } = req.body as any;

  // Simple prompt construction: concatenate messages with role prefixes
  const prompt = (messages || []).map((m: any) => `${m.role?.toUpperCase() || 'USER'}: ${m.content}`).join('\n');

  const puter = await getPuter();

  // Resolve model: 'auto' → undefined (Puter default agent), otherwise use provided model
  const resolvedModel = model === 'auto' ? undefined : (model ?? 'gpt-5-nano');

  const logFile = logMessageToFile('PUTER REQUEST PROMPT', prompt);

  const options: any = {
    model: resolvedModel,
    max_tokens,
    stream: !!stream
  };

  // Only add temperature if it's explicitly provided and valid
  if (temperature !== undefined) {
    options.temperature = temperature;
  }

  const response = await puter.ai.chat(prompt, options);

  if (stream) {
    return {
      type: 'stream',
      pipe: async (res) => {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();

        let fullResponse = '';
        try {
          for await (const chunk of response) {
            if (chunk.text) {
              fullResponse += chunk.text;
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk.text } }] })}\n\n`);
            }
          }
          appendMessageToFile(logFile, 'PUTER STREAMING RESPONSE', fullResponse);
          res.write('data: [DONE]\n\n');
        } catch (streamErr) {
          serverLogger.logSync(`Puter streaming error: ${streamErr}`);
          if (!res.headersSent) {
            res.write(
              `data: ${JSON.stringify({ error: { message: (streamErr as any)?.message || 'Stream error' } })}\n\n`
            );
          }
        }
        res.end();
      }
    };
  }

  const content = response.message?.content ?? '';
  appendMessageToFile(logFile, 'PUTER RESPONSE', content);
  const result = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model ?? 'auto',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop'
      }
    ]
  };

  return { type: 'json', data: result };
}

/**
 * Handle responses API for Puter provider.
 */
export async function handleResponses(req: Request): Promise<ProviderResult> {
  const requestData = req.body as ResponsesRequest;

  // Transform to chat completions format to leverage existing puter prompt logic
  const chatReq = convertResponsesRequestToChatCompletions(requestData);

  // Simple prompt construction: concatenate messages with role prefixes
  const prompt = (chatReq.messages || [])
    .map((m: any) => `${m.role?.toUpperCase() || 'USER'}: ${m.content}`)
    .join('\n');

  const puter = await getPuter();

  // Resolve model: 'auto' → undefined (Puter default agent), otherwise use provided model
  const resolvedModel = chatReq.model === 'auto' ? undefined : (chatReq.model ?? 'gpt-5-nano');

  const logFile = logMessageToFile('PUTER REQUEST PROMPT (Responses API)', prompt);

  const options: any = {
    model: resolvedModel,
    max_tokens: chatReq.max_tokens,
    stream: !!chatReq.stream
  };

  if (chatReq.temperature !== undefined) {
    options.temperature = chatReq.temperature;
  }

  if (chatReq.stream) {
    return {
      type: 'stream',
      pipe: async (res) => {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();

        const responseId = `resp_${Date.now()}`;

        // Emit the initial response created event
        res.write(
          `data: ${JSON.stringify({
            type: 'response.created',
            response: { id: responseId, object: 'response', status: 'in_progress', model: resolvedModel || 'gpt-4o' }
          })}\n\n`
        );

        let fullResponse = '';
        try {
          const response = await puter.ai.chat(prompt, options);
          for await (const chunk of response) {
            if (chunk.text) {
              fullResponse += chunk.text;
              const deltaPayload = convertStreamingChunkToResponses({
                id: responseId,
                choices: [{ delta: { content: chunk.text } }]
              });
              res.write(`data: ${JSON.stringify(deltaPayload)}\n\n`);
            }
          }
          appendMessageToFile(logFile, 'PUTER STREAMING RESPONSE (Responses API)', fullResponse);
          res.write(
            `data: ${JSON.stringify({ type: 'response.done', response: { id: responseId, status: 'completed' } })}\n\n`
          );
          res.write('data: [DONE]\n\n');
        } catch (streamErr) {
          serverLogger.logSync(`Puter Responses streaming error: ${streamErr}`);
          if (!res.headersSent) {
            res.write(
              `data: ${JSON.stringify({ error: { message: (streamErr as any)?.message || 'Stream error' } })}\n\n`
            );
          }
        }
        res.end();
      }
    };
  }

  const response = await puter.ai.chat(prompt, options);
  const content = response.message?.content ?? '';
  appendMessageToFile(logFile, 'PUTER RESPONSE (Responses API)', content);

  // We mimic chatCompletions output first, then convert it
  const chatCompletionsFormat = {
    model: resolvedModel,
    choices: [
      {
        message: { role: 'assistant', content }
      }
    ]
  };

  const result = convertChatCompletionsToResponses(chatCompletionsFormat, requestData.model);
  return { type: 'json', data: result };
}
