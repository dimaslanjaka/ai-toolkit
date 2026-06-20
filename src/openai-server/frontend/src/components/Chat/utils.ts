import { type Provider } from '../../context/SettingsContext';
import type { Conversation } from './types';
import { STORAGE_KEY } from './constants';

export function createId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function now(): string {
  return new Date().toISOString();
}

export function createConversation(): Conversation {
  const timestamp = now();
  return {
    id: createId(),
    title: 'New chat',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: []
  };
}

export function getInitialConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Conversation[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return [createConversation()];
}

export function getRequestHeaders(settings: { apiKey: string; provider: Provider }): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AI-Toolkit-Frontend': 'true'
  };

  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }

  if (settings.provider !== 'auto') {
    headers['X-Request-Provider'] = settings.provider;
  }

  return headers;
}

export function extractDelta(payload: any): string {
  const content = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .join('');
  }

  return '';
}

export function readSseEvent(event: string): { delta: string; done: boolean; error?: string } {
  let delta = '';

  for (const rawLine of event.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line.startsWith('data:')) {
      continue;
    }

    const data = line.slice(5).trim();

    if (data === '[DONE]') {
      return { delta, done: true };
    }

    if (!data) {
      continue;
    }

    try {
      const payload = JSON.parse(data);

      if (payload?.error?.message) {
        return { delta, done: false, error: payload.error.message };
      }

      delta += extractDelta(payload);
    } catch {
      // Ignore non-JSON keepalive data.
    }
  }

  return { delta, done: false };
}
