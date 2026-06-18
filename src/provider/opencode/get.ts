import OpenAI from 'openai';
import { buildOpenAIClient, BuildOpenAIClientOptions } from '../../utils/buildOpenAIClient.js';

let client: OpenAI | null = null;

export default async function get(options?: BuildOpenAIClientOptions): Promise<OpenAI> {
  if (!client) {
    const { client: newClient } = await buildOpenAIClient({
      provider: 'opencode',
      model: 'deepseek-v4-flash-free',
      proxy: options?.proxy,
      apiKeys: options?.apiKeys
    });
    client = newClient;
  }
  return client;
}

export const opencodeProvider = get;
