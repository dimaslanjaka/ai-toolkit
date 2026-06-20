import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings, type Provider } from '../context/SettingsContext';
import '../styles.css';
import { fallbackTitleFromPrompt, normalizeGeneratedTitle } from '../utils/title';
import { createApiUrl } from '../utils/url';
import type { ChatMessage, Conversation, ModelEntry } from './Chat/types';
import { STORAGE_KEY, PROVIDER_OPTIONS, PROMPT_SUGGESTIONS } from './Chat/constants';
import {
  createId,
  now,
  createConversation,
  getInitialConversations,
  getRequestHeaders,
  extractDelta,
  readSseEvent
} from './Chat/utils';
import { IconButton } from './Chat/IconButton';
import LeftSidebar from './Chat/LeftSidebar';

export default function Chat() {
  const { settings, setSettings } = useSettings();
  const [conversations, setConversations] = useState<Conversation[]>(getInitialConversations);
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('ai-toolkit-chat-activeId-v1');
      if (stored && getInitialConversations().some((c) => c.id === stored)) {
        return stored;
      }
    } catch {}
    return getInitialConversations()[0]?.id || '';
  });
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [connectionState, setConnectionState] = useState<'checking' | 'online' | 'offline'>('checking');
  const [composer, setComposer] = useState('');
  const [_isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const abortControllerRef = useRef<Record<string, AbortController>>({});
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? conversations[0],
    [activeId, conversations]
  );

  const isActiveConversationSending = useMemo(() => {
    return activeConversation?.messages.some((msg) => msg.status === 'streaming') ?? false;
  }, [activeConversation?.messages]);

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

  // Persist conversations to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  // Persist active conversation ID
  useEffect(() => {
    localStorage.setItem('ai-toolkit-chat-activeId-v1', activeId);
  }, [activeId]);

  // Load models on mount and when settings change

  useEffect(() => {
    const controller = new AbortController();

    async function loadModels() {
      setConnectionState('checking');

      try {
        const response = await fetch(createApiUrl('/v1/models', { apiBase: settings.apiBase }), {
          headers: getRequestHeaders(settings),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Model request failed with ${response.status}`);
        }

        const payload = await response.json();
        const nextModels = payload.data ? payload.data.filter((model: any) => typeof model?.id === 'string') : [];

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
  }, [settings, setSettings]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: isActiveConversationSending ? 'smooth' : 'auto' });
  }, [activeConversation?.messages, isActiveConversationSending]);

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
      abortControllerRef.current[conversationId] = controller;
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

        return null;
      } finally {
        if (abortControllerRef.current[conversationId] === controller) {
          delete abortControllerRef.current[conversationId];
        }
        setIsSending(false);
      }
    },
    [settings, updateConversation]
  );

  const submitPrompt = useCallback(
    async (prompt: string, baseMessages?: ChatMessage[]) => {
      const trimmed = prompt.trim();

      if (!trimmed || isActiveConversationSending || !activeConversation) {
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
    [activeConversation, generateConversationTitle, isActiveConversationSending, streamCompletion, updateConversation]
  );

  const regenerateLastResponse = useCallback(() => {
    if (!activeConversation || isActiveConversationSending) {
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
  }, [activeConversation, isActiveConversationSending, submitPrompt]);

  const stopGeneration = useCallback(() => {
    if (activeConversation?.id) {
      abortControllerRef.current[activeConversation.id]?.abort();
    }
  }, [activeConversation?.id]);

  const startNewChat = useCallback(() => {
    if (isActiveConversationSending) {
      abortControllerRef.current[activeConversation?.id as string]?.abort();
    }
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
    setComposer('');
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [isActiveConversationSending, activeConversation?.id]);

  const deleteConversation = useCallback(
    (conversationId: string) => {
      setConversations((current) => {
        const remaining = current.filter((conversation) => conversation.id !== conversationId);
        if (remaining.length) {
          if (conversationId === activeId) {
            setActiveId(remaining[0].id);
            setComposer('');
          }
        }
        return remaining;
      });
    },
    [activeId]
  );

  const handleRenameStart = useCallback((conversation: Conversation) => {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      updateConversation(renamingId, (conversation) => ({
        ...conversation,
        title: renameValue.trim(),
        updatedAt: now()
      }));
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, updateConversation]);

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt(composer);
    }
  }

  return (
    <div className={`flex min-w-0 flex-1 overflow-hidden`}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/55 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Conversation history sidebar */}
      <LeftSidebar
        sidebarOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
        }}
        onNewChat={startNewChat}
        onDeleteConversation={deleteConversation}
        onRenameStart={handleRenameStart}
        renamingId={renamingId}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onRenameConfirm={handleRenameConfirm}
        onRenameCancel={handleRenameCancel}
      />

      <section className="app-scrollbar min-h-0 flex-1 overflow-y-auto pb-80 lg:pb-56">
        {!activeConversation?.messages.length ? (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-start px-5 pt-10 pb-48 md:justify-center md:pt-12">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-emerald-600 text-lg text-white shadow-lg shadow-emerald-950/20">
                <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">How can I help you today?</h1>
              <p className="mt-2 text-sm text-neutral-500">Chat through your local OpenAI-compatible Express server.</p>
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
                  className={`rounded-xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${settings.theme === 'dark' ? 'border-white/10 bg-neutral-800/40 hover:bg-neutral-800' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
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
                className={`group flex gap-3 py-5 md:gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' ? (
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                    <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles" />
                  </div>
                ) : null}

                <div
                  className={`min-w-0 ${message.role === 'user' ? `max-w-[85%] rounded-3xl px-5 py-3 ${settings.theme === 'dark' ? 'bg-neutral-700' : 'bg-neutral-100'}` : 'w-full pt-1'}`}>
                  {message.role === 'assistant' ? (
                    <div
                      className={`markdown-body ${message.status === 'streaming' ? 'typing-cursor' : ''} ${message.status === 'error' ? 'text-red-300' : ''}`}>
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
                        <IconButton label="Regenerate response" onClick={regenerateLastResponse} className="size-8">
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
        className={`fixed inset-x-0 bottom-14 lg:bottom-0 lg:left-72 z-40 bg-gradient-to-t ${settings.theme === 'dark' ? 'from-[#212121] via-[#212121] to-transparent' : 'from-white via-white to-transparent'} pt-16`}>
        <div className="mx-auto w-full max-w-3xl px-3 pb-3 md:px-5 md:pb-5">
          <div
            className={`rounded-[1.7rem] border p-2 shadow-xl ${settings.theme === 'dark' ? 'border-white/10 bg-[#303030] shadow-black/20' : 'border-neutral-200 bg-white shadow-neutral-300/30'}`}>
            <textarea
              ref={textareaRef}
              value={composer}
              rows={1}
              aria-label="Message"
              placeholder="Message Toolkit Chat"
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              className={`app-scrollbar max-h-48 min-h-11 w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-2.5 text-[15px] leading-6 outline-none placeholder:text-neutral-500 focus:ring-0 ${settings.theme === 'dark' ? 'text-neutral-100' : 'text-neutral-900'}`}
            />
            <div className="flex items-center gap-2 px-1 pb-1">
              <label className="relative">
                <span className="sr-only">Provider</span>
                <select
                  value={settings.provider}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, provider: event.target.value as Provider }))
                  }
                  className={`max-w-[6rem] appearance-none truncate rounded-lg border-0 bg-transparent py-1 pr-5 pl-1.5 text-xs focus:ring-2 focus:ring-emerald-500 md:max-w-[8rem] ${settings.theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>
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
                    className={`max-w-[6rem] appearance-none truncate rounded-lg border-0 bg-transparent py-1 pr-5 pl-1.5 text-xs focus:ring-2 focus:ring-emerald-500 md:max-w-[8rem] ${settings.theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>
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

              <span
                className={`ml-auto hidden items-center gap-1.5 text-xs md:flex ${connectionState === 'online' ? 'text-emerald-400' : connectionState === 'checking' ? 'text-amber-400' : 'text-neutral-500'}`}>
                <i
                  aria-hidden="true"
                  className={`fa-solid ${connectionState === 'online' ? 'fa-plug-circle-check' : 'fa-circle-exclamation'}`}
                />
                {connectionState === 'online'
                  ? 'Connected'
                  : connectionState === 'checking'
                    ? 'Checking'
                    : 'Server offline'}
              </span>

              <button
                type="button"
                aria-label={isActiveConversationSending ? 'Stop generating' : 'Send message'}
                title={isActiveConversationSending ? 'Stop generating' : 'Send message'}
                disabled={!isActiveConversationSending && !composer.trim()}
                onClick={() => (isActiveConversationSending ? stopGeneration() : void submitPrompt(composer))}
                className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-800 ${isActiveConversationSending ? 'bg-white text-neutral-900 hover:bg-neutral-200' : composer.trim() ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'cursor-not-allowed bg-neutral-600 text-neutral-400'}`}>
                <i
                  aria-hidden="true"
                  className={`fa-solid ${isActiveConversationSending ? 'fa-stop' : 'fa-paper-plane'} text-sm`}
                />
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-neutral-500">
            AI can make mistakes. Check important information.
          </p>
        </div>
      </div>
    </div>
  );
}
