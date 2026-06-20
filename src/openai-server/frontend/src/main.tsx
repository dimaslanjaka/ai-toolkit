import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ProxyManager from './components/ProxyLogs';
import './styles.css';
import { fallbackTitleFromPrompt, normalizeGeneratedTitle } from './utils/title';
import { createApiUrl, sanitizeStoredApiBase } from './utils/url';

type Provider = 'auto' | 'opencode' | 'puter' | 'chatgpt';

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'puter', label: 'Puter' },
  { value: 'chatgpt', label: 'ChatGPT' }
];

type Theme = 'dark' | 'light';
type AppView = 'chat' | 'proxy-manager';
type MessageRole = 'user' | 'assistant';
type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status: MessageStatus;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface ChatSettings {
  apiBase: string;
  apiKey: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  theme: Theme;
}

interface ModelEntry {
  id: string;
  owned_by?: string;
}

const STORAGE_KEY = 'ai-toolkit-chat-state-v1';
const DEFAULT_MODEL = '';

const DEFAULT_SETTINGS: ChatSettings = {
  apiBase: '',
  apiKey: '',
  provider: 'auto',
  model: DEFAULT_MODEL,
  systemPrompt: '',
  theme: 'dark'
};

const PROMPT_SUGGESTIONS = [
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

function createId(): string {
  // Generate ID from random + timestamp (base‑36) for web compatibility.
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

function getViewFromPath(): AppView {
  return /\/proxy-manager\/?$/.test(window.location.pathname) ? 'proxy-manager' : 'chat';
}

function createConversation(): Conversation {
  const timestamp = now();

  return {
    id: createId(),
    title: 'New chat',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: []
  };
}

function getInitialState(): { conversations: Conversation[]; activeId: string; settings: ChatSettings } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      const parsed = JSON.parse(stored) as {
        conversations?: Conversation[];
        activeId?: string;
        settings?: Partial<ChatSettings>;
      };
      const conversations = parsed.conversations?.length ? parsed.conversations : [createConversation()];
      const activeId =
        parsed.activeId && conversations.some((conversation) => conversation.id === parsed.activeId)
          ? parsed.activeId
          : conversations[0].id;

      return {
        conversations,
        activeId,
        settings: {
          ...DEFAULT_SETTINGS,
          ...parsed.settings,
          apiBase: sanitizeStoredApiBase(parsed.settings?.apiBase ?? '')
        }
      };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const conversation = createConversation();

  return {
    conversations: [conversation],
    activeId: conversation.id,
    settings: DEFAULT_SETTINGS
  };
}

function getRequestHeaders(settings: Pick<ChatSettings, 'apiKey' | 'provider'>): HeadersInit {
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

function extractDelta(payload: any): string {
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

function readSseEvent(event: string): { delta: string; done: boolean; error?: string } {
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

function IconButton({
  label,
  onClick,
  children,
  className = ''
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-700/50 hover:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${className}`}>
      {children}
    </button>
  );
}

function App() {
  const initial = useMemo(getInitialState, []);
  const [conversations, setConversations] = useState<Conversation[]>(initial.conversations);
  const [activeId, setActiveId] = useState(initial.activeId);
  const [settings, setSettings] = useState<ChatSettings>(initial.settings);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [connectionState, setConnectionState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [activeView, setActiveView] = useState<AppView>(getViewFromPath);
  const [composer, setComposer] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { apiBase, apiKey, provider } = settings;

  const navigateToView = useCallback((view: AppView) => {
    const nextPath = view === 'proxy-manager' ? '/chat/proxy-manager' : '/chat/';

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }

    setActiveView(view);
    setSidebarOpen(false);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? conversations[0],
    [activeId, conversations]
  );
  const lastAssistantId = useMemo(() => {
    const messages = activeConversation?.messages ?? [];

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'assistant') {
        return messages[index].id;
      }
    }

    return null;
  }, [activeConversation?.messages]);

  const updateConversation = useCallback(
    (conversationId: string, update: (conversation: Conversation) => Conversation) => {
      setConversations((current) =>
        current.map((conversation) => (conversation.id === conversationId ? update(conversation) : conversation))
      );
    },
    []
  );

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversations,
        activeId,
        settings
      })
    );
  }, [activeId, conversations, settings]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', settings.theme === 'light');
  }, [settings.theme]);

  useEffect(() => {
    const handlePopState = () => setActiveView(getViewFromPath());

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: isSending ? 'smooth' : 'auto' });
  }, [activeConversation?.messages, isSending]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadModels() {
      setConnectionState('checking');

      try {
        const response = await fetch(createApiUrl('/v1/models', { apiBase }), {
          headers: getRequestHeaders({ apiKey, provider }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Model request failed with ${response.status}`);
        }

        const payload = await response.json();
        const nextModels = Array.isArray(payload?.data)
          ? payload.data.filter((model: any) => typeof model?.id === 'string' && model.enabled !== false)
          : [];

        if (!nextModels.length) {
          throw new Error('The server returned no models');
        }

        setModels(nextModels);
        setSettings((current) => ({
          ...current,
          model: nextModels.some((model: ModelEntry) => model.id === current.model) ? current.model : nextModels[0].id
        }));
        setConnectionState('online');
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }

        setModels([]);
        setConnectionState('offline');
      }
    }

    void loadModels();

    return () => controller.abort();
  }, [apiBase, apiKey, provider]);

  const startNewChat = useCallback(() => {
    if (isSending) {
      abortControllerRef.current?.abort();
    }

    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    navigateToView('chat');
    setComposer('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [isSending, navigateToView]);

  const deleteConversation = useCallback(
    (conversationId: string) => {
      setConversations((current) => {
        const remaining = current.filter((conversation) => conversation.id !== conversationId);

        if (remaining.length) {
          if (conversationId === activeId) {
            setActiveId(remaining[0].id);
          }

          return remaining;
        }

        const replacement = createConversation();
        setActiveId(replacement.id);
        return [replacement];
      });
    },
    [activeId]
  );

  const generateConversationTitle = useCallback(
    async (prompt: string, assistantResponse: string, fallbackTitle: string): Promise<string> => {
      try {
        const titlePrompt = [
          'Create a concise title for this chat.',
          'Return only the title with no quotes, prefix, markdown, or ending period.',
          'Use at most 6 words.',
          '',
          `User: ${prompt.slice(0, 2000)}`,
          `Assistant: ${assistantResponse.slice(0, 2000)}`
        ].join('\n');
        const response = await fetch(createApiUrl('/v1/chat/completions', { apiBase: settings.apiBase }), {
          method: 'POST',
          headers: getRequestHeaders(settings),
          body: JSON.stringify({
            model: settings.model,
            messages: [{ role: 'user', content: titlePrompt }],
            stream: false,
            max_tokens: 64
          })
        });

        if (!response.ok) {
          return fallbackTitle;
        }

        const payload = await response.json();
        return normalizeGeneratedTitle(extractDelta(payload), fallbackTitle);
      } catch {
        return fallbackTitle;
      }
    },
    [settings]
  );

  const streamCompletion = useCallback(
    async (conversationId: string, requestMessages: ChatMessage[], assistantId: string): Promise<string | null> => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsSending(true);
      let assistantContent = '';

      try {
        const messages = [
          ...(settings.systemPrompt.trim() ? [{ role: 'system', content: settings.systemPrompt.trim() }] : []),
          ...requestMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        ];
        const response = await fetch(createApiUrl('/v1/chat/completions', { apiBase: settings.apiBase }), {
          method: 'POST',
          headers: getRequestHeaders(settings),
          body: JSON.stringify({
            model: settings.model,
            messages,
            stream: true
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const body = await response.text();
          let message = body || `Request failed with ${response.status}`;

          try {
            message = JSON.parse(body)?.error?.message ?? message;
          } catch {
            // Keep the raw response body.
          }

          throw new Error(message);
        }

        if (!response.body) {
          throw new Error('The browser did not expose the streaming response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completed = false;

        while (!completed) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? '';

          if (done && buffer.trim()) {
            events.push(buffer);
            buffer = '';
          }

          for (const event of events) {
            const parsed = readSseEvent(event);

            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.delta) {
              assistantContent += parsed.delta;
              updateConversation(conversationId, (conversation) => ({
                ...conversation,
                updatedAt: now(),
                messages: conversation.messages.map((message) =>
                  message.id === assistantId ? { ...message, content: message.content + parsed.delta } : message
                )
              }));
            }

            if (parsed.done) {
              completed = true;
              break;
            }
          }

          if (done) {
            break;
          }
        }

        updateConversation(conversationId, (conversation) => ({
          ...conversation,
          updatedAt: now(),
          messages: conversation.messages.map((message) =>
            message.id === assistantId ? { ...message, status: 'complete' } : message
          )
        }));
        setConnectionState('online');
        return assistantContent.trim();
      } catch (error) {
        const aborted = (error as Error).name === 'AbortError';

        updateConversation(conversationId, (conversation) => ({
          ...conversation,
          updatedAt: now(),
          messages: conversation.messages.map((message) => {
            if (message.id !== assistantId) {
              return message;
            }

            if (aborted) {
              return {
                ...message,
                content: message.content || 'Generation stopped.',
                status: 'stopped'
              };
            }

            return {
              ...message,
              content: message.content || `Request failed: ${(error as Error).message}`,
              status: 'error'
            };
          })
        }));

        if (!aborted) {
          setConnectionState('offline');
        }

        return null;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }

        setIsSending(false);
      }
    },
    [settings, updateConversation]
  );

  const submitPrompt = useCallback(
    async (prompt: string, baseMessages?: ChatMessage[]) => {
      const trimmed = prompt.trim();

      if (!trimmed || isSending || !activeConversation) {
        return;
      }

      const timestamp = now();
      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: trimmed,
        createdAt: timestamp,
        status: 'complete'
      };
      const assistantMessage: ChatMessage = {
        id: createId(),
        role: 'assistant',
        content: '',
        createdAt: timestamp,
        status: 'streaming'
      };
      const sourceMessages = baseMessages ?? activeConversation.messages;
      const requestMessages = [...sourceMessages, userMessage];
      const shouldGenerateTitle = sourceMessages.length === 0 && activeConversation.messages.length === 0;
      const fallbackTitle = shouldGenerateTitle ? fallbackTitleFromPrompt(trimmed) : activeConversation.title;

      updateConversation(activeConversation.id, (conversation) => ({
        ...conversation,
        title: shouldGenerateTitle ? fallbackTitle : conversation.title,
        updatedAt: timestamp,
        messages: [...sourceMessages, userMessage, assistantMessage]
      }));
      setComposer('');
      const assistantResponse = await streamCompletion(activeConversation.id, requestMessages, assistantMessage.id);

      if (shouldGenerateTitle && assistantResponse) {
        const generatedTitle = await generateConversationTitle(trimmed, assistantResponse, fallbackTitle);

        updateConversation(activeConversation.id, (conversation) => ({
          ...conversation,
          title: conversation.title === fallbackTitle ? generatedTitle : conversation.title,
          updatedAt: now()
        }));
      }
    },
    [activeConversation, generateConversationTitle, isSending, streamCompletion, updateConversation]
  );

  const regenerateLastResponse = useCallback(() => {
    if (!activeConversation || isSending) {
      return;
    }

    const messages = [...activeConversation.messages];
    let lastAssistantIndex = -1;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'assistant') {
        lastAssistantIndex = index;
        break;
      }
    }

    if (lastAssistantIndex < 1) {
      return;
    }

    const userMessage = messages[lastAssistantIndex - 1];

    if (userMessage.role !== 'user') {
      return;
    }

    const baseMessages = messages.slice(0, lastAssistantIndex - 1);
    void submitPrompt(userMessage.content, baseMessages);
  }, [activeConversation, isSending, submitPrompt]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt(composer);
    }
  }

  return (
    <div
      className={`flex h-dvh overflow-hidden ${
        settings.theme === 'dark' ? 'bg-[#212121] text-neutral-100' : 'bg-white text-neutral-900'
      }`}>
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/55 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col bg-[#171717] text-neutral-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={startNewChat}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <span className="flex size-7 items-center justify-center rounded-full bg-emerald-600 text-xs">
              <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles" />
            </span>
            <span className="truncate">New chat</span>
            <i aria-hidden="true" className="fa-solid fa-pen-to-square ml-auto text-neutral-400" />
          </button>
          <IconButton label="Close sidebar" onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <i aria-hidden="true" className="fa-solid fa-xmark" />
          </IconButton>
        </div>

        <div className="px-3 pb-2 text-xs font-medium text-neutral-500">Recent</div>
        <nav className="app-scrollbar flex-1 space-y-1 overflow-y-auto px-2">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group flex items-center rounded-lg transition ${
                activeView === 'chat' && conversation.id === activeConversation?.id
                  ? 'bg-neutral-800'
                  : 'hover:bg-neutral-800/70'
              }`}>
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm focus:outline-none"
                onClick={() => {
                  setActiveId(conversation.id);
                  navigateToView('chat');
                }}>
                {conversation.title}
              </button>
              <button
                type="button"
                aria-label={`Delete ${conversation.title}`}
                title="Delete conversation"
                className="mr-1 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 opacity-0 transition hover:bg-neutral-700 hover:text-red-300 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                onClick={() => deleteConversation(conversation.id)}>
                <i aria-hidden="true" className="fa-solid fa-trash text-xs" />
              </button>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => navigateToView('proxy-manager')}
            className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              activeView === 'proxy-manager'
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-300 hover:bg-neutral-800'
            }`}>
            <i aria-hidden="true" className="fa-solid fa-network-wired w-4 text-neutral-400" />
            Proxy manager
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-300 transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <i aria-hidden="true" className="fa-solid fa-gear w-4 text-neutral-400" />
            Settings
            <span
              className={`ml-auto size-2 rounded-full ${
                connectionState === 'online'
                  ? 'bg-emerald-400'
                  : connectionState === 'checking'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-red-400'
              }`}
            />
          </button>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header
          className={`flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4 ${
            settings.theme === 'dark' ? 'border-white/5 bg-[#212121]/90' : 'border-neutral-200 bg-white/90'
          }`}>
          <IconButton label="Open sidebar" onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <i aria-hidden="true" className="fa-solid fa-bars" />
          </IconButton>

          {activeView === 'proxy-manager' && (
            <div className="min-w-0 px-2">
              <p className="truncate text-sm font-semibold">Proxy manager</p>
              <p className="hidden text-[11px] text-neutral-500 sm:block">OpenCode proxy operations</p>
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            {activeView === 'chat' ? (
              <span
                className={`mr-1 hidden items-center gap-1.5 text-xs md:flex ${
                  connectionState === 'online'
                    ? 'text-emerald-400'
                    : connectionState === 'checking'
                      ? 'text-amber-400'
                      : 'text-neutral-500'
                }`}>
                <i
                  aria-hidden="true"
                  className={`fa-solid ${
                    connectionState === 'online' ? 'fa-plug-circle-check' : 'fa-circle-exclamation'
                  }`}
                />
                {connectionState === 'online'
                  ? 'Connected'
                  : connectionState === 'checking'
                    ? 'Checking'
                    : 'Server offline'}
              </span>
            ) : null}
            <IconButton
              label={settings.theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  theme: current.theme === 'dark' ? 'light' : 'dark'
                }))
              }>
              <i aria-hidden="true" className={`fa-solid ${settings.theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
            </IconButton>
            <IconButton label="Open settings" onClick={() => setSettingsOpen(true)}>
              <i aria-hidden="true" className="fa-solid fa-gear" />
            </IconButton>
          </div>
        </header>

        {activeView === 'proxy-manager' ? (
          <ProxyManager apiBase={settings.apiBase} apiKey={settings.apiKey} theme={settings.theme} />
        ) : (
          <>
            <section className="app-scrollbar min-h-0 flex-1 overflow-y-auto">
              {!activeConversation?.messages.length ? (
                <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-start px-5 pt-10 pb-48 md:justify-center md:pt-12">
                  <div className="mb-8 text-center">
                    <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-emerald-600 text-lg text-white shadow-lg shadow-emerald-950/20">
                      <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">How can I help you today?</h1>
                    <p className="mt-2 text-sm text-neutral-500">
                      Chat through your local OpenAI-compatible Express server.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {PROMPT_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion.title}
                        type="button"
                        onClick={() => {
                          setComposer(suggestion.prompt);
                          requestAnimationFrame(() => textareaRef.current?.focus());
                        }}
                        className={`rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                          settings.theme === 'dark'
                            ? 'border-white/10 bg-neutral-800/40 hover:bg-neutral-800'
                            : 'border-neutral-200 bg-white hover:bg-neutral-50'
                        }`}>
                        <span className="block text-sm font-semibold">{suggestion.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-neutral-500">{suggestion.prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-40 md:px-6">
                  {activeConversation.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`group flex gap-3 py-5 md:gap-4 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}>
                      {message.role === 'assistant' ? (
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                          <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles" />
                        </div>
                      ) : null}

                      <div
                        className={`min-w-0 ${
                          message.role === 'user'
                            ? `max-w-[85%] rounded-3xl px-5 py-3 ${
                                settings.theme === 'dark' ? 'bg-neutral-700' : 'bg-neutral-100'
                              }`
                            : 'w-full pt-1'
                        }`}>
                        {message.role === 'assistant' ? (
                          <div
                            className={`markdown-body ${
                              message.status === 'streaming' ? 'typing-cursor' : ''
                            } ${message.status === 'error' ? 'text-red-300' : ''}`}>
                            {message.content ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                            ) : (
                              <span className="text-neutral-500">Thinking</span>
                            )}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-[15px] leading-6">{message.content}</p>
                        )}

                        {message.role === 'assistant' && message.status !== 'streaming' ? (
                          <div className="mt-2 flex items-center gap-1 text-neutral-500 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                            <IconButton
                              label="Copy response"
                              onClick={() => void navigator.clipboard.writeText(message.content)}
                              className="size-8">
                              <i aria-hidden="true" className="fa-solid fa-copy text-xs" />
                            </IconButton>
                            {message.id === lastAssistantId ? (
                              <IconButton
                                label="Regenerate response"
                                onClick={regenerateLastResponse}
                                className="size-8">
                                <i aria-hidden="true" className="fa-solid fa-rotate-right text-xs" />
                              </IconButton>
                            ) : null}
                            {message.status === 'stopped' ? <span className="ml-1 text-xs">Stopped</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  <div ref={messageEndRef} />
                </div>
              )}
            </section>

            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t ${
                settings.theme === 'dark'
                  ? 'from-[#212121] via-[#212121] to-transparent'
                  : 'from-white via-white to-transparent'
              } pt-16`}>
              <div className="pointer-events-auto mx-auto w-full max-w-3xl px-3 pb-3 md:px-5 md:pb-5">
                <div
                  className={`rounded-[1.7rem] border p-2 shadow-xl ${
                    settings.theme === 'dark'
                      ? 'border-white/10 bg-[#303030] shadow-black/20'
                      : 'border-neutral-200 bg-white shadow-neutral-300/30'
                  }`}>
                  <textarea
                    ref={textareaRef}
                    value={composer}
                    rows={1}
                    aria-label="Message"
                    placeholder="Message Toolkit Chat"
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    className={`app-scrollbar max-h-48 min-h-11 w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-2.5 text-[15px] leading-6 outline-none placeholder:text-neutral-500 focus:ring-0 ${
                      settings.theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900'
                    }`}
                  />
                  <div className="flex items-center gap-2 px-1 pb-1">
                    <label className="relative">
                      <span className="sr-only">Provider</span>
                      <select
                        value={settings.provider}
                        onChange={(event) => setSettings((current) => ({ ...current, provider: event.target.value as Provider }))}
                        className={`max-w-[6rem] appearance-none truncate rounded-lg border-0 bg-transparent py-1 pr-5 pl-1.5 text-xs focus:ring-2 focus:ring-emerald-500 md:max-w-[8rem] ${
                          settings.theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'
                        }`}>
                        {PROVIDER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[10px] text-neutral-500">
                        ▾
                      </span>
                    </label>

                    {settings.provider !== 'auto' && (
                      <label className="relative">
                        <span className="sr-only">Model</span>
                        <select
                          value={settings.model}
                          onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}
                          className={`max-w-[6rem] appearance-none truncate rounded-lg border-0 bg-transparent py-1 pr-5 pl-1.5 text-xs focus:ring-2 focus:ring-emerald-500 md:max-w-[8rem] ${
                            settings.theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'
                          }`}>
                          {models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.id}
                            </option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[10px] text-neutral-500">
                          ▾
                        </span>
                      </label>
                    )}
                    <button
                      type="button"
                      aria-label={isSending ? 'Stop generating' : 'Send message'}
                      title={isSending ? 'Stop generating' : 'Send message'}
                      disabled={!isSending && !composer.trim()}
                      onClick={() => (isSending ? stopGeneration() : void submitPrompt(composer))}
                      className={`ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-800 ${
                        isSending
                          ? 'bg-white text-neutral-900 hover:bg-neutral-200'
                          : composer.trim()
                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : 'cursor-not-allowed bg-neutral-600 text-neutral-400'
                      }`}>
                      <i
                        aria-hidden="true"
                        className={`fa-solid ${isSending ? 'fa-stop' : 'fa-paper-plane'} text-sm`}
                      />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-center text-[11px] text-neutral-500">
                  AI can make mistakes. Check important information.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title">
          <div
            className={`app-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border shadow-2xl ${
              settings.theme === 'dark'
                ? 'border-white/10 bg-[#242424] text-neutral-100'
                : 'border-neutral-200 bg-white text-neutral-900'
            }`}>
            <div
              className={`flex items-center border-b px-5 py-4 ${
                settings.theme === 'dark' ? 'border-white/10' : 'border-neutral-200'
              }`}>
              <div>
                <h2 id="settings-title" className="font-semibold">
                  Connection settings
                </h2>
                <p className="mt-0.5 text-xs text-neutral-500">Saved only in this browser.</p>
              </div>
              <IconButton label="Close settings" onClick={() => setSettingsOpen(false)} className="ml-auto">
                <i aria-hidden="true" className="fa-solid fa-xmark" />
              </IconButton>
            </div>

            <div className="space-y-5 p-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Provider</span>
                <select
                  value={settings.provider}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      provider: event.target.value as Provider
                    }))
                  }
                  className={`block w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                    settings.theme === 'dark'
                      ? 'border-neutral-600 bg-neutral-800 text-white'
                      : 'border-neutral-300 bg-white'
                  }`}>
                  {PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">API base URL</span>
                <input
                  type="url"
                  value={settings.apiBase}
                  placeholder="Optional absolute URL"
                  onChange={(event) => setSettings((current) => ({ ...current, apiBase: event.target.value }))}
                  onBlur={(event) =>
                    setSettings((current) => ({
                      ...current,
                      apiBase: sanitizeStoredApiBase(event.target.value)
                    }))
                  }
                  className={`block w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                    settings.theme === 'dark'
                      ? 'border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500'
                      : 'border-neutral-300 bg-white'
                  }`}
                />
                <span className="mt-1.5 block text-xs text-neutral-500">
                  Only complete HTTP(S) URLs are accepted. Leave empty to use the environment backend hostname.
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Bearer token</span>
                <input
                  type="password"
                  value={settings.apiKey}
                  placeholder="Optional"
                  autoComplete="off"
                  onChange={(event) => setSettings((current) => ({ ...current, apiKey: event.target.value }))}
                  className={`block w-full rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                    settings.theme === 'dark'
                      ? 'border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500'
                      : 'border-neutral-300 bg-white'
                  }`}
                />
                <span className="mt-1.5 block text-xs text-amber-500">
                  The current server records this token but does not validate it.
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">System prompt</span>
                <textarea
                  value={settings.systemPrompt}
                  rows={4}
                  placeholder="Optional instructions sent before the conversation"
                  onChange={(event) => setSettings((current) => ({ ...current, systemPrompt: event.target.value }))}
                  className={`app-scrollbar block w-full resize-y rounded-lg border px-3 py-2.5 text-sm focus:border-emerald-500 focus:ring-emerald-500 ${
                    settings.theme === 'dark'
                      ? 'border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500'
                      : 'border-neutral-300 bg-white'
                  }`}
                />
              </label>

              <div
                className={`flex items-center rounded-xl border p-3 ${
                  connectionState === 'online'
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-amber-500/30 bg-amber-500/10'
                }`}>
                <i
                  aria-hidden="true"
                  className={`fa-solid ${
                    connectionState === 'online'
                      ? 'fa-plug-circle-check text-emerald-400'
                      : 'fa-circle-exclamation text-amber-400'
                  }`}
                />
                <span className="ml-3 text-sm">
                  {connectionState === 'online'
                    ? 'The model endpoint is responding.'
                    : 'Models unavailable until the server responds.'}
                </span>
              </div>
            </div>

            <div
              className={`flex justify-end border-t px-5 py-4 ${
                settings.theme === 'dark' ? 'border-white/10' : 'border-neutral-200'
              }`}>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-800">
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
