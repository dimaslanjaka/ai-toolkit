import { Request, Response } from 'express';
import { serverLogger, logMessageToFile } from '../utils.js';
import {
  convertResponsesRequestToChatCompletions,
  convertChatCompletionsToResponses,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';

// Lazy-load the Puter provider to avoid token prompts at import time
let puterInstance: any;
async function getPuter() {
  if (!puterInstance) {
    const { puterProvider } = await import('../../provider');
    puterInstance = await puterProvider();
  }
  return puterInstance;
}

// Curated models from Puter documentation tutorials
// Source: https://developer.puter.com/tutorials/free-unlimited-openai-api/
// Source: https://developer.puter.com/tutorials/free-unlimited-claude-35-sonnet-api/
// Source: https://developer.puter.com/tutorials/free-llm-api/
export const PUTER_MODEL_LIST = [
  // OpenAI Models
  { id: 'gpt-5.5-pro', provider: 'openai' },
  { id: 'gpt-5.5', provider: 'openai' },
  { id: 'gpt-5.4-mini', provider: 'openai' },
  { id: 'gpt-5.4-nano', provider: 'openai' },
  { id: 'gpt-5.4', provider: 'openai' },
  { id: 'gpt-5.4-pro', provider: 'openai' },
  { id: 'gpt-5.3-chat', provider: 'openai' },
  { id: 'gpt-5.3-codex', provider: 'openai' },
  { id: 'gpt-5.2', provider: 'openai' },
  { id: 'gpt-5.2-chat', provider: 'openai' },
  { id: 'gpt-5.2-codex', provider: 'openai' },
  { id: 'gpt-5.2-pro', provider: 'openai' },
  { id: 'gpt-5.1', provider: 'openai' },
  { id: 'gpt-5.1-chat-latest', provider: 'openai' },
  { id: 'gpt-5.1-codex', provider: 'openai' },
  { id: 'gpt-5.1-codex-mini', provider: 'openai' },
  { id: 'gpt-5.1-codex-max', provider: 'openai' },
  { id: 'gpt-5-codex', provider: 'openai' },
  { id: 'gpt-5', provider: 'openai' },
  { id: 'gpt-5-mini', provider: 'openai' },
  { id: 'gpt-5-nano', provider: 'openai' },
  { id: 'gpt-5-chat-latest', provider: 'openai' },
  { id: 'gpt-4.1', provider: 'openai' },
  { id: 'gpt-4.1-mini', provider: 'openai' },
  { id: 'gpt-4.1-nano', provider: 'openai' },
  { id: 'gpt-4.5-preview', provider: 'openai' },
  { id: 'gpt-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', provider: 'openai' },
  { id: 'o1', provider: 'openai' },
  { id: 'o1-mini', provider: 'openai' },
  { id: 'o1-pro', provider: 'openai' },
  { id: 'o3', provider: 'openai' },
  { id: 'o3-mini', provider: 'openai' },
  { id: 'o4-mini', provider: 'openai' },
  { id: 'gpt-image-2', provider: 'openai' },
  { id: 'gpt-image-1.5', provider: 'openai' },
  { id: 'gpt-image-1-mini', provider: 'openai' },
  { id: 'gpt-image-1', provider: 'openai' },
  { id: 'dall-e-3', provider: 'openai' },
  { id: 'dall-e-2', provider: 'openai' },
  { id: 'gpt-4o-mini-tts', provider: 'openai' },
  { id: 'tts-1', provider: 'openai' },
  { id: 'tts-1-hd', provider: 'openai' },
  { id: 'gpt-oss-120b', provider: 'openai' },

  // Claude Models
  { id: 'claude-fable-5', provider: 'anthropic' },
  { id: 'claude-opus-4.8-fast', provider: 'anthropic' },
  { id: 'claude-opus-4-8', provider: 'anthropic' },
  { id: 'claude-opus-4.7-fast', provider: 'anthropic' },
  { id: 'claude-opus-4-7', provider: 'anthropic' },
  { id: 'claude-opus-4.6-fast', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', provider: 'anthropic' },
  { id: 'claude-opus-4-6', provider: 'anthropic' },
  { id: 'claude-opus-4-5', provider: 'anthropic' },
  { id: 'claude-haiku-4-5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-5', provider: 'anthropic' },
  { id: 'claude-opus-4-1', provider: 'anthropic' },
  { id: 'claude-opus-4', provider: 'anthropic' },
  { id: 'claude-sonnet-4', provider: 'anthropic' },

  // Other providers (from free-llm-api tutorial)
  { id: 'deepseek-r1-0528', provider: 'deepseek' },
  { id: 'anthropic/claude-sonnet-4-6', provider: 'anthropic' },
  { id: 'openai/gpt-5.4-nano', provider: 'openai' }
];

/**
 * Handle listing models for Puter provider.
 */
export async function handleModels(req: Request, res: Response) {
  try {
    const openaiModels = PUTER_MODEL_LIST.map((model) => ({
      id: model.id,
      object: 'model',
      created: 1718380395,
      owned_by: model.provider,
      permission: [],
      root: model.id,
      parent: null
    }));

    res.json({
      object: 'list',
      data: openaiModels
    });
  } catch (err) {
    console.error('Models endpoint error:', err);
    res.status(500).json({ error: { message: (err as any).message || 'Internal server error' } });
  }
}

/**
 * Handle chat completion for Puter provider.
 */
export async function handleChatCompletion(req: Request, res: Response) {
  try {
    const { model, messages, stream, temperature, max_tokens } = req.body as any;

    // Simple prompt construction: concatenate messages with role prefixes
    const prompt = (messages || []).map((m: any) => `${m.role?.toUpperCase() || 'USER'}: ${m.content}`).join('\n');

    const puter = await getPuter();

    // Resolve model: 'auto' → undefined (Puter default agent), otherwise use provided model
    const resolvedModel = model === 'auto' ? undefined : (model ?? 'gpt-5-nano');

    logMessageToFile('PUTER REQUEST PROMPT', prompt);

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
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();

      let fullResponse = '';
      for await (const chunk of response) {
        if (chunk.text) {
          fullResponse += chunk.text;
          // Send each text chunk as an SSE data event
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk.text } }] })}\n\n`);
        }
      }
      logMessageToFile('PUTER STREAMING RESPONSE', fullResponse);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const content = response.message?.content ?? '';
      logMessageToFile('PUTER RESPONSE', content);
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
      res.json(result);
    }
  } catch (err: any) {
    serverLogger.logSync(`Chat endpoint error: ${err}`);
    // Determine the error message gracefully
    let errorMessage = 'Internal server error';
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (err && typeof err === 'object') {
      // In case the error is a custom object without a message property but thrown anyway
      errorMessage = err.message || err.toString();
    } else if (typeof err === 'string') {
      errorMessage = err;
    }

    // Check if it's a "no usage left" error
    if (errorMessage.toLowerCase().includes('no usage left')) {
      serverLogger.logSync('Puter: no usage left. Falling back to ChatGPT...');
      try {
        const chatgptProvider = await import('./chatgpt.js');
        return await chatgptProvider.handleChatCompletion(req, res);
      } catch (fallbackErr: any) {
        serverLogger.logSync(`ChatGPT fallback error: ${fallbackErr}`);
        errorMessage = `Puter: ${errorMessage}. ChatGPT fallback failed: ${fallbackErr.message || fallbackErr}`;
      }
    }

    // Since we're in an async express handler, we shouldn't throw; we just end the response.
    // If headers are already sent (like in SSE streaming), just end the stream.
    if (!res.headersSent) {
      res.status(500).json({ error: { message: errorMessage } });
    } else {
      res.write(`data: ${JSON.stringify({ error: { message: errorMessage } })}\n\n`);
      res.end();
    }
  }
}

/**
 * Handle responses API for Puter provider.
 */
export async function handleResponses(req: Request, res: Response) {
  try {
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

    logMessageToFile('PUTER REQUEST PROMPT (Responses API)', prompt);

    const options: any = {
      model: resolvedModel,
      max_tokens: chatReq.max_tokens,
      stream: !!chatReq.stream
    };

    if (chatReq.temperature !== undefined) {
      options.temperature = chatReq.temperature;
    }

    if (chatReq.stream) {
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
      const response = await puter.ai.chat(prompt, options);
      for await (const chunk of response) {
        if (chunk.text) {
          fullResponse += chunk.text;
          // Send each text chunk as an SSE data event
          const deltaPayload = convertStreamingChunkToResponses({
            id: responseId,
            choices: [{ delta: { content: chunk.text } }]
          });
          res.write(`data: ${JSON.stringify(deltaPayload)}\n\n`);
        }
      }
      logMessageToFile('PUTER STREAMING RESPONSE (Responses API)', fullResponse);
      res.write(
        `data: ${JSON.stringify({ type: 'response.done', response: { id: responseId, status: 'completed' } })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await puter.ai.chat(prompt, options);
      const content = response.message?.content ?? '';
      logMessageToFile('PUTER RESPONSE (Responses API)', content);

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
      res.json(result);
    }
  } catch (err: any) {
    serverLogger.logSync(`Responses endpoint error: ${err}`);
    let errorMessage = 'Internal server error';
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (err && typeof err === 'object') {
      errorMessage = err.message || err.toString();
    } else if (typeof err === 'string') {
      errorMessage = err;
    }

    // Check if it's a "no usage left" error
    if (errorMessage.toLowerCase().includes('no usage left')) {
      serverLogger.logSync('Puter (Responses API): no usage left. Falling back to ChatGPT...');
      try {
        const chatgptProvider = await import('./chatgpt.js');
        return await chatgptProvider.handleResponses(req, res);
      } catch (fallbackErr: any) {
        serverLogger.logSync(`ChatGPT fallback error: ${fallbackErr}`);
        errorMessage = `Puter: ${errorMessage}. ChatGPT fallback failed: ${fallbackErr.message || fallbackErr}`;
      }
    }

    if (!res.headersSent) {
      res.status(500).json({ error: { message: errorMessage } });
    } else {
      res.write(`data: ${JSON.stringify({ error: { message: errorMessage } })}\n\n`);
      res.end();
    }
  }
}
