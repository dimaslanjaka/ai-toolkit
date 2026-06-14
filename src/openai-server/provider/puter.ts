import { Request, Response } from 'express';

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

    const options: any = {
      model: resolvedModel,
      max_tokens,
      stream: !!stream
    };

    // Only add temperature if it's explicitly provided and valid
    if (temperature !== undefined) {
      options.temperature = temperature;
    }

    if (stream) {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();

      const response = await puter.ai.chat(prompt, options);
      for await (const chunk of response) {
        if (chunk.text) {
          // Send each text chunk as an SSE data event
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk.text } }] })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await puter.ai.chat(prompt, options);
      const content = response.message?.content ?? '';
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
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: { message: (err as any).message || 'Internal server error' } });
  }
}
