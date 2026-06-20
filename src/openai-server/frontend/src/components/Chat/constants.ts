import { type Provider } from '../../context/SettingsContext';

export const STORAGE_KEY = 'ai-toolkit-chat-conversations-v1';

export const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'puter', label: 'Puter' },
  { value: 'chatgpt', label: 'ChatGPT' }
];

export const PROMPT_SUGGESTIONS = [
  {
    title: 'Explain this server',
    prompt: 'Explain how an OpenAI-compatible Express server handles streaming chat completions.'
  },
  {
    title: 'Write TypeScript',
    prompt: 'Write a concise TypeScript retry helper with exponential backoff and AbortSignal support.'
  },
  {
    title: 'Debug an API',
    prompt: 'Give me a practical checklist for debugging a Server-Sent Events streaming API.'
  },
  {
    title: 'Plan a feature',
    prompt: 'Help me plan authentication and rate limiting for a locally hosted AI chat server.'
  }
];
