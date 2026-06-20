import { Request, Response } from 'express';
import { getSharedModels } from '../../database/shared.js';
import { serverLogger, logMessageToFile, appendMessageToFile } from '../utils.js';
import {
  convertResponsesRequestToChatCompletions,
  convertChatCompletionsToResponses,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';
import type { ProviderResult } from './index.js';
import { chatgptProvider } from '../../provider/chatgpt/get.js';

/**
 * Handle listing models for ChatGPT provider
 */
export async function handleModels(_req: Request): Promise<ProviderResult> {
  const modelDb = await getSharedModels();
  await modelDb.initialize();

  const modelsApi = await modelDb.models();
  const dbModels = await modelsApi.find({ provider: 'chatgpt' });

  const models = dbModels.map((model: any) => ({
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
      data: models
    }
  };
}

/**
 * Handle chat completion for ChatGPT provider
 */
export async function handleChatCompletion(req: Request): Promise<ProviderResult> {
  const { model, messages, stream } = req.body as any;

  // Extract the last user message
  const userMessages = (messages || []).filter((m: any) => m.role === 'user');
  if (userMessages.length === 0) {
    throw new Error('No user message provided');
  }

  const lastUserMessage = userMessages[userMessages.length - 1].content;

  serverLogger.log(
    `ChatGPT request - Model: ${model}, Stream: ${stream}, Message: ${lastUserMessage.substring(0, 50)}...`
  );
  const logFile = logMessageToFile('CHATGPT REQUEST PROMPT', lastUserMessage);

  // Obtain the generic ChatGPT provider (handles Puppeteer session)
  const provider = await chatgptProvider();

  if (stream) {
    return {
      type: 'stream',
      pipe: async (res: Response) => {
        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        try {
          // Use provider's streaming API
          await provider.stream(lastUserMessage, (chunk) => {
            const data = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model || 'gpt-4o',
              choices: [
                {
                  index: 0,
                  delta: { content: chunk },
                  finish_reason: null
                }
              ]
            };
            res.write(`data: ${JSON.stringify(data)}\n\n`);
          });

          // Append full response after streaming completes
          // (provider.stream returns full response, but we already logged chunks incrementally)
          // final chunk: finished
          const finalChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
          };
          res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
        } catch (streamErr) {
          serverLogger.logSync(`ChatGPT streaming error: ${streamErr}`);
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: (streamErr as Error).message } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  // Non‑streaming response
  const fullResponse = await provider.chat(lastUserMessage);
  appendMessageToFile(logFile, 'CHATGPT RESPONSE', fullResponse);

  const result = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'gpt-4o',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: fullResponse },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };

  return { type: 'json', data: result };
}

/**
 * Handle responses API for ChatGPT provider
 */
export async function handleResponses(req: Request): Promise<ProviderResult> {
  const requestData = req.body as ResponsesRequest;

  // Transform to ChatCompletions format
  const chatReq = convertResponsesRequestToChatCompletions(requestData);

  // Extract last user message
  const userMessages = (chatReq.messages || []).filter((m: any) => m.role === 'user');
  if (userMessages.length === 0) {
    throw new Error('No user message provided');
  }
  const lastUserMessage = userMessages[userMessages.length - 1].content;

  serverLogger.log(
    `ChatGPT Responses request - Model: ${requestData.model}, Stream: ${requestData.stream}, Message: ${lastUserMessage.substring(0, 50)}...`
  );
  const logFile = logMessageToFile('CHATGPT REQUEST PROMPT (Responses API)', lastUserMessage);

  const provider = await chatgptProvider();

  if (requestData.stream) {
    return {
      type: 'stream',
      pipe: async (res: Response) => {
        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const responseId = `resp_${Date.now()}`;
        // Initial response.created event
        res.write(
          `data: ${JSON.stringify({
            type: 'response.created',
            response: {
              id: responseId,
              object: 'response',
              status: 'in_progress',
              model: requestData.model || 'gpt-4o'
            }
          })}\n\n`
        );

        try {
          // Stream via generic provider
          await provider.stream(lastUserMessage, (chunk) => {
            const deltaPayload = convertStreamingChunkToResponses({
              id: responseId,
              choices: [{ delta: { content: chunk } }]
            });
            res.write(`data: ${JSON.stringify(deltaPayload)}\n\n`);
          });
          // Completion event
          res.write(
            `data: ${JSON.stringify({ type: 'response.done', response: { id: responseId, status: 'completed' } })}\n\n`
          );
          res.write('data: [DONE]\n\n');
        } catch (streamErr) {
          serverLogger.logSync(`ChatGPT Responses streaming error: ${streamErr}`);
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: (streamErr as Error).message } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  // Non‑streaming response
  const fullResponse = await provider.chat(lastUserMessage);
  appendMessageToFile(logFile, 'CHATGPT RESPONSE (Responses API)', fullResponse);

  const chatCompletionsFormat = {
    model: requestData.model,
    choices: [{ message: { role: 'assistant', content: fullResponse } }]
  };
  const result = convertChatCompletionsToResponses(chatCompletionsFormat, requestData.model);
  return { type: 'json', data: result };
}

/**
 * Cleanup browser session (call on server shutdown)
 */
export async function cleanup() {
  // Obtain provider and close its Puppeteer session
  const provider = await chatgptProvider();
  if (provider && typeof provider.close === 'function') {
    await provider.close();
    serverLogger.log('ChatGPT browser session closed via generic provider');
  }
}
