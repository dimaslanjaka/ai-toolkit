import { Request, Response } from 'express';
import { serverLogger } from '../utils.js';

async function getProviderModule(req?: Request) {
  const provider = (req?.headers?.['x-request-provider'] as string | undefined) || 'puter';
  serverLogger.log(`Using AI provider: ${provider}`);
  return loadProviderModule(provider);
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

export async function handleModels(req: Request, res: Response) {
  const mod = await getProviderModule(req);
  return mod.handleModels(req, res);
}

export async function handleChatCompletion(req: Request, res: Response) {
  const mod = await getProviderModule(req);
  return mod.handleChatCompletion(req, res);
}

export async function handleResponses(req: Request, res: Response) {
  const mod = await getProviderModule(req);
  return mod.handleResponses(req, res);
}
