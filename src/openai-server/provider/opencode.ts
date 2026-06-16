import { Request, Response } from 'express';
import type OpenAI from 'openai';
import { serverLogger, logMessageToFile } from '../utils.js';
import {
  convertResponsesRequestToChatCompletions,
  convertChatCompletionsToResponses,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';

// Lazy-load the OpenCode provider to avoid SDK init at import time
let opencodeClient: OpenAI | null = null;
async function getOpenCode(): Promise<OpenAI> {
  if (!opencodeClient) {
    const { opencodeProvider } = await import('../../provider');
    opencodeClient = await opencodeProvider();
  }
  return opencodeClient;
}

export const OPENCODE_MODEL_LIST = [
  // Default alias
  { id: 'opencode-default', provider: 'opencode' },

  // Free models (opencode.ai/zen/v1 with apiKey='public')
  { id: 'deepseek-v4-flash-free', provider: 'opencode' },
  { id: 'big-pickle', provider: 'opencode' },
  { id: 'mimo-v2.5-free', provider: 'opencode' },
  { id: 'qwen3.6-plus-free', provider: 'opencode' },
  { id: 'minimax-m3-free', provider: 'opencode' },
  { id: 'nemotron-3-ultra-free', provider: 'opencode' },
  { id: 'north-mini-code-free', provider: 'opencode' },

  // Premium models (require apiKey)
  { id: 'claude-fable-5', provider: 'opencode' },
  { id: 'claude-opus-4-8', provider: 'opencode' },
  { id: 'claude-opus-4-7', provider: 'opencode' },
  { id: 'claude-opus-4-6', provider: 'opencode' },
  { id: 'claude-opus-4-5', provider: 'opencode' },
  { id: 'claude-sonnet-4-6', provider: 'opencode' },
  { id: 'claude-sonnet-4-5', provider: 'opencode' },
  { id: 'claude-haiku-4-5', provider: 'opencode' },
  { id: 'gemini-3.5-flash', provider: 'opencode' },
  { id: 'gemini-3.1-pro', provider: 'opencode' },
  { id: 'gemini-3-flash', provider: 'opencode' },
  { id: 'gpt-5.5', provider: 'opencode' },
  { id: 'gpt-5.5-pro', provider: 'opencode' },
  { id: 'gpt-5.4', provider: 'opencode' },
  { id: 'gpt-5.4-pro', provider: 'opencode' },
  { id: 'gpt-5.4-mini', provider: 'opencode' },
  { id: 'gpt-5.4-nano', provider: 'opencode' },
  { id: 'gpt-5.3-codex-spark', provider: 'opencode' },
  { id: 'gpt-5.3-codex', provider: 'opencode' },
  { id: 'gpt-5.2', provider: 'opencode' },
  { id: 'gpt-5', provider: 'opencode' },
  { id: 'gpt-5-nano', provider: 'opencode' },
  { id: 'grok-build-0.1', provider: 'opencode' },
  { id: 'deepseek-v4-pro', provider: 'opencode' },
  { id: 'deepseek-v4-flash', provider: 'opencode' },
  { id: 'minimax-m2.7', provider: 'opencode' },
  { id: 'minimax-m2.5', provider: 'opencode' },
  { id: 'qwen3.6-plus', provider: 'opencode' },
  { id: 'qwen3.5-plus', provider: 'opencode' },
  { id: 'kimi-k2.6', provider: 'opencode' },
  { id: 'kimi-k2.5', provider: 'opencode' },
  { id: 'glm-5.1', provider: 'opencode' },
  { id: 'glm-5', provider: 'opencode' },
];

export async function handleModels(req: Request, res: Response) {
  try {
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
      res.json({ object: 'list', data });
      return;
    } catch {
      const data = OPENCODE_MODEL_LIST.map((model) => ({
        id: model.id,
        object: 'model',
        created: 1718380395,
        owned_by: model.provider,
        permission: [],
        root: model.id,
        parent: null
      }));
      res.json({ object: 'list', data });
    }
  } catch (err) {
    serverLogger.logSync(`OpenCode Models endpoint error: ${err}`);
    res.status(500).json({ error: { message: (err as any).message || 'Internal server error' } });
  }
}

export async function handleChatCompletion(req: Request, res: Response) {
  try {
    const { model, messages, stream, temperature, max_tokens } = req.body as any;

    const promptPreview = (messages || [])
      .map((m: any) => `${m.role}: ${(m.content || '').toString().substring(0, 80)}`)
      .join(' | ');
    serverLogger.log(`OpenCode Chat - Model: ${model}, Stream: ${!!stream}, Messages: ${promptPreview}`);
    logMessageToFile('OPENCODE REQUEST', JSON.stringify({ model, messages, stream, temperature, max_tokens }, null, 2));

    const client = await getOpenCode();
    const baseBody = {
      model: model || 'opencode-default',
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature,
      max_tokens
    };

    if (stream) {
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
        logMessageToFile('OPENCODE STREAMING RESPONSE', fullResponse);
      } catch (streamErr: any) {
        serverLogger.logSync(`OpenCode streaming error: ${streamErr}`);
        res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
      }
      res.end();
    } else {
      const completion = await client.chat.completions.create({
        ...baseBody,
        stream: false as const
      });
      const content = completion.choices?.[0]?.message?.content || '';
      logMessageToFile('OPENCODE RESPONSE', content);

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model ?? 'opencode-default',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: completion.usage || {}
      });
    }
  } catch (err: any) {
    serverLogger.logSync(`OpenCode Chat Completion error: ${err}`);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message || 'Internal server error' } });
    } else {
      res.write(`data: ${JSON.stringify({ error: { message: err.message || 'Internal server error' } })}\n\n`);
      res.end();
    }
  }
}

export async function handleResponses(req: Request, res: Response) {
  try {
    const requestData = req.body as ResponsesRequest;
    const chatReq = convertResponsesRequestToChatCompletions(requestData);
    const { model, messages, stream, temperature, max_tokens } = chatReq;

    const promptPreview = (messages || [])
      .map((m: any) => `${m.role}: ${(m.content || '').toString().substring(0, 80)}`)
      .join(' | ');
    serverLogger.log(
      `OpenCode Responses - Model: ${requestData.model}, Stream: ${!!stream}, Messages: ${promptPreview}`
    );
    logMessageToFile('OPENCODE RESPONSES REQUEST', JSON.stringify(requestData, null, 2));

    const client = await getOpenCode();
    const baseBody = {
      model: model || 'opencode-default',
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature,
      max_tokens
    };

    if (stream) {
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
        logMessageToFile('OPENCODE RESPONSES STREAMING RESPONSE', fullResponse);
      } catch (streamErr: any) {
        serverLogger.logSync(`OpenCode Responses streaming error: ${streamErr}`);
        res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
      }
      res.end();
    } else {
      const completion = await client.chat.completions.create({
        ...baseBody,
        stream: false as const
      });
      const content = completion.choices?.[0]?.message?.content || '';
      logMessageToFile('OPENCODE RESPONSES RESPONSE', content);

      const chatCompletionsFormat = {
        model: requestData.model,
        choices: [{ message: { role: 'assistant', content } }]
      };
      const result = convertChatCompletionsToResponses(chatCompletionsFormat, requestData.model);
      res.json(result);
    }
  } catch (err: any) {
    serverLogger.logSync(`OpenCode Responses error: ${err}`);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message || 'Internal server error' } });
    } else {
      res.write(`data: ${JSON.stringify({ error: { message: err.message || 'Internal server error' } })}\n\n`);
      res.end();
    }
  }
}
