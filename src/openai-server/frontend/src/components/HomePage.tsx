import React, { useState } from 'react';

type Theme = 'dark' | 'light';

import { useNavigate } from 'react-router';
import { useSettings } from '../context/SettingsContext';

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/v1/models',
    description: 'List available models from the active provider',
    category: 'OpenAI-Compatible'
  },
  {
    method: 'POST',
    path: '/v1/chat/completions',
    description: 'Primary chat completion endpoint. Supports streaming (SSE) and non-streaming.',
    category: 'OpenAI-Compatible'
  },
  {
    method: 'POST',
    path: '/v1/responses',
    description: 'OpenAI Responses API endpoint. Converts Responses format to Chat Completions internally.',
    category: 'OpenAI-Compatible'
  },
  {
    method: 'POST',
    path: '/v1/completions',
    description: 'Legacy text completion endpoint (used by VSCode autocomplete/inline suggestions).',
    category: 'OpenAI-Compatible'
  },
  {
    method: 'POST',
    path: '/v1/embeddings',
    description: 'Embeddings endpoint. Returns deterministic local hash vectors for API compatibility.',
    category: 'OpenAI-Compatible'
  },
  {
    method: 'ALL',
    path: '/proxy-checker/start',
    description: 'Starts the proxy checker process. Returns 202 on success, 409 if already running.',
    category: 'Proxy Checker'
  },
  {
    method: 'ALL',
    path: '/proxy-checker/stop',
    description: 'Stops the running proxy checker. Returns 200 on success, 400 if not running.',
    category: 'Proxy Checker'
  },
  {
    method: 'GET',
    path: '/proxy-checker/status',
    description: 'Returns current proxy checker status (state, PID, timestamps, exit code, errors).',
    category: 'Proxy Checker'
  },
  {
    method: 'GET',
    path: '/proxy-checker/logs',
    description: 'Returns recent proxy checker logs. Query param: `limit` (default 200).',
    category: 'Proxy Checker'
  },
  {
    method: 'GET',
    path: '/proxy-checker/proxies',
    description: 'Lists active proxies for a host. Required query param: `host`.',
    category: 'Proxy Checker'
  },
  {
    method: 'GET',
    path: '/',
    description: 'Redirects to `/chat/`',
    category: 'Frontend'
  },
  {
    method: 'GET',
    path: '/chat/*',
    description: 'Serves the React chat frontend (Vite-built).',
    category: 'Frontend'
  }
];

const PROVIDERS = [
  {
    name: 'OpenCode',
    id: 'opencode',
    description: 'Backend: opencode.ai/zen/v1 via OpenAI SDK',
    defaultModel: 'deepseek-v4-flash-free',
    features: ['HTTP proxy support', 'Proxy health tracking', 'Automatic dead-proxy marking'],
    models: [
      'deepseek-v4-flash-free',
      'big-pickle',
      'mimo-v2.5-free',
      'qwen3.6-plus-free',
      'minimax-m3-free',
      'nemotron-3-ultra-free',
      'north-mini-code-free'
    ]
  },
  {
    name: 'Puter',
    id: 'puter',
    description: 'Backend: Puter.js SDK (@heyputer/puter.js) — Default provider',
    defaultModel: 'gpt-5-nano',
    features: [
      '50+ models',
      'OpenAI GPT-5.x/4.x',
      'Claude Opus/Sonnet',
      'DeepSeek',
      'Image models (DALL-E)',
      'TTS models'
    ],
    models: ['gpt-5-nano', 'gpt-4o', 'claude-opus', 'claude-sonnet', 'deepseek', 'dall-e-3', 'tts-1']
  },
  {
    name: 'ChatGPT',
    id: 'chatgpt',
    description: 'Backend: Puppeteer browser automation against chat.openai.com',
    defaultModel: 'gpt-4o',
    features: ['Browser automation', 'Persistent session', 'Streaming via DOM observation'],
    models: ['gpt-4o', 'gpt-4']
  }
];

const QUICK_START_CODE = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${window.location.origin}/v1',
  apiKey: 'dummy-key' // Any string works
});

// Non-streaming
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the capital of France?' }]
});

console.log(response.choices[0].message.content);

// Streaming
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}`;

const CURL_EXAMPLES = `# Non-streaming
curl -X POST ${window.location.origin}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "stream": false
  }'

# Streaming
curl -X POST ${window.location.origin}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Tell me a joke"}],
    "stream": true
  }'`;

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-emerald-500/20 text-emerald-400',
    POST: 'bg-blue-500/20 text-blue-400',
    ALL: 'bg-purple-500/20 text-purple-400'
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${colors[method] || 'bg-neutral-500/20 text-neutral-400'}`}>
      {method}
    </span>
  );
}

function EndpointCard({ endpoint, theme }: { endpoint: (typeof API_ENDPOINTS)[0]; theme: Theme }) {
  return (
    <div
      className={`rounded-xl border p-4 transition hover:scale-[1.01] ${
        theme === 'dark'
          ? 'border-white/10 bg-neutral-800/40 hover:bg-neutral-800'
          : 'border-neutral-200 bg-white hover:bg-neutral-50'
      }`}>
      <div className="flex items-start gap-3">
        <MethodBadge method={endpoint.method} />
        <div className="min-w-0 flex-1">
          <code className={`block text-sm font-mono ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>
            {endpoint.path}
          </code>
          <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {endpoint.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ provider, theme }: { provider: (typeof PROVIDERS)[0]; theme: Theme }) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
      }`}>
      <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>
        {provider.name}
      </h3>
      <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
        {provider.description}
      </p>
      <div className="mt-3">
        <span className={`text-xs font-medium ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'}`}>
          Default Model:
        </span>
        <code className={`ml-2 text-xs ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>
          {provider.defaultModel}
        </code>
      </div>
      <div className="mt-3">
        <span className={`text-xs font-medium ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'}`}>
          Features:
        </span>
        <ul className="mt-1 space-y-1">
          {provider.features.map((feature) => (
            <li
              key={feature}
              className={`flex items-center gap-2 text-xs ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
              <i className="fa-solid fa-check text-emerald-500 text-[10px]" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const theme = settings.theme;
  const [activeSection, setActiveSection] = useState<string>('overview');

  const sections = [
    { id: 'overview', label: 'Overview', icon: 'fa-house' },
    { id: 'endpoints', label: 'API Endpoints', icon: 'fa-code' },
    { id: 'quickstart', label: 'Quick Start', icon: 'fa-rocket' },
    { id: 'providers', label: 'Providers', icon: 'fa-server' },
    { id: 'config', label: 'Configuration', icon: 'fa-gear' }
  ];

  const groupedEndpoints = API_ENDPOINTS.reduce(
    (acc, ep) => {
      if (!acc[ep.category]) acc[ep.category] = [];
      acc[ep.category].push(ep);
      return acc;
    },
    {} as Record<string, typeof API_ENDPOINTS>
  );

  return (
    <div className={`${theme === 'dark' ? 'bg-[#212121] text-neutral-100' : 'bg-white text-neutral-900'}`}>
      {/* Header */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur ${
          theme === 'dark' ? 'border-white/5 bg-[#212121]/90' : 'border-neutral-200 bg-white/90'
        }`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-white">
              <i className="fa-solid fa-wand-magic-sparkles text-sm" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">AI Toolkit Server</h1>
              <p className={`text-xs ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'}`}>
                OpenAI-Compatible API Server
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/chat')}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <i className="fa-solid fa-comments mr-2" />
            Open Chat
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Navigation Tabs */}
        <nav className="mb-8 flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeSection === section.id
                  ? 'bg-emerald-600 text-white'
                  : theme === 'dark'
                    ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}>
              <i className={`fa-solid ${section.icon}`} />
              {section.label}
            </button>
          ))}
        </nav>

        {/* Overview Section */}
        {activeSection === 'overview' && (
          <div className="space-y-8">
            {/* Hero */}
            <div
              className="rounded-2xl border p-8 text-center ${
              theme === 'dark'
                ? 'border-white/10 bg-gradient-to-br from-neutral-800/50 to-neutral-900/50'
                : 'border-neutral-200 bg-gradient-to-br from-neutral-50 to-white'
            }">
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white shadow-lg shadow-emerald-950/20">
                <i className="fa-solid fa-wand-magic-sparkles" />
              </div>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">AI Toolkit Server</h2>
              <p
                className={`mx-auto mt-4 max-w-2xl text-lg ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                A multi-provider OpenAI-compatible API server with automatic fallback, streaming support, and a built-in
                chat interface.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                <div
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 ${
                    theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100'
                  }`}>
                  <i className="fa-solid fa-plug text-emerald-500" />
                  <span className="text-sm font-medium">3 Providers</span>
                </div>
                <div
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 ${
                    theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100'
                  }`}>
                  <i className="fa-solid fa-bolt text-amber-500" />
                  <span className="text-sm font-medium">Streaming SSE</span>
                </div>
                <div
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 ${
                    theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100'
                  }`}>
                  <i className="fa-solid fa-shield text-blue-500" />
                  <span className="text-sm font-medium">HTTPS by Default</span>
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: 'fa-code',
                  title: 'OpenAI-Compatible API',
                  description: 'Drop-in replacement for OpenAI API. Use any OpenAI SDK or client.'
                },
                {
                  icon: 'fa-arrows-spin',
                  title: 'Multi-Provider Fallback',
                  description: 'Automatic fallback chain: OpenCode → Puter → ChatGPT.'
                },
                {
                  icon: 'fa-wave-square',
                  title: 'Streaming Support',
                  description: 'Full Server-Sent Events (SSE) support for real-time responses.'
                },
                {
                  icon: 'fa-comments',
                  title: 'Built-in Chat UI',
                  description: 'React-based chat interface with markdown rendering.'
                },
                {
                  icon: 'fa-network-wired',
                  title: 'Proxy Manager',
                  description: 'Manage and monitor HTTP proxies for provider requests.'
                },
                {
                  icon: 'fa-lock',
                  title: 'HTTPS by Default',
                  description: 'Secure connections via mkcert certificates.'
                }
              ].map((feature) => (
                <div
                  key={feature.title}
                  className={`rounded-xl border p-5 ${
                    theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
                  }`}>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-500">
                    <i className={`fa-solid ${feature.icon}`} />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Endpoints Section */}
        {activeSection === 'endpoints' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">API Endpoints</h2>
              <p className={`mt-2 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Complete reference for all available API endpoints.
              </p>
            </div>

            {Object.entries(groupedEndpoints).map(([category, endpoints]) => (
              <div key={category}>
                <h3
                  className={`mb-3 text-lg font-semibold ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  {category}
                </h3>
                <div className="space-y-3">
                  {endpoints.map((endpoint) => (
                    <EndpointCard key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} theme={theme} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Start Section */}
        {activeSection === 'quickstart' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Quick Start</h2>
              <p className={`mt-2 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Get started with the API in minutes.
              </p>
            </div>

            {/* OpenAI SDK */}
            <div
              className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
              }`}>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <i className="fa-brands fa-js text-amber-500" />
                Using OpenAI SDK
              </h3>
              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Install the OpenAI SDK and connect to this server as a drop-in replacement.
              </p>
              <div className="mt-4 overflow-x-auto">
                <pre
                  className={`rounded-lg p-4 text-sm ${
                    theme === 'dark' ? 'bg-neutral-900 text-neutral-100' : 'bg-neutral-100 text-neutral-900'
                  }`}>
                  <code>{QUICK_START_CODE}</code>
                </pre>
              </div>
            </div>

            {/* cURL Examples */}
            <div
              className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
              }`}>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <i className="fa-solid fa-terminal text-emerald-500" />
                Using cURL
              </h3>
              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Test the API directly from the command line.
              </p>
              <div className="mt-4 overflow-x-auto">
                <pre
                  className={`rounded-lg p-4 text-sm ${
                    theme === 'dark' ? 'bg-neutral-900 text-neutral-100' : 'bg-neutral-100 text-neutral-900'
                  }`}>
                  <code>{CURL_EXAMPLES}</code>
                </pre>
              </div>
            </div>

            {/* Key Features */}
            <div
              className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
              }`}>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <i className="fa-solid fa-lightbulb text-amber-500" />
                Key Features
              </h3>
              <ul className="mt-4 space-y-3">
                {[
                  'Full SSE streaming support (`data: {...}\\n\\n` + `data: [DONE]\\n\\n`)',
                  'Automatic provider fallback chain',
                  'CORS enabled for all origins',
                  'Optional Bearer token authentication',
                  'Request logging to `tmp/logs/openai-compatible/messages/`',
                  'HTTPS by default via mkcert certificates',
                  'Auto-incrementing port (starts at 5758)',
                  '50 MB JSON body limit'
                ].map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-2 ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                    <i className="fa-solid fa-check mt-1 text-emerald-500" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Providers Section */}
        {activeSection === 'providers' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Providers</h2>
              <p className={`mt-2 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                The server supports multiple AI providers with automatic fallback.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PROVIDERS.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} theme={theme} />
              ))}
            </div>

            {/* Fallback Chain */}
            <div
              className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
              }`}>
              <h3 className="text-lg font-semibold">Fallback Chain</h3>
              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                The server automatically falls back to the next provider if the current one fails.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-sm font-medium text-emerald-400">
                  OpenCode
                </span>
                <i className="fa-solid fa-arrow-right text-neutral-500" />
                <span className="rounded-lg bg-blue-600/20 px-3 py-1.5 text-sm font-medium text-blue-400">Puter</span>
                <i className="fa-solid fa-arrow-right text-neutral-500" />
                <span className="rounded-lg bg-purple-600/20 px-3 py-1.5 text-sm font-medium text-purple-400">
                  ChatGPT
                </span>
              </div>
              <p className={`mt-4 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Override with the{' '}
                <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs">X-Request-Provider</code> header.
              </p>
            </div>
          </div>
        )}

        {/* Configuration Section */}
        {activeSection === 'config' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Configuration</h2>
              <p className={`mt-2 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Environment variables and configuration options.
              </p>
            </div>

            {/* Environment Variables */}
            <div
              className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
              }`}>
              <h3 className="text-lg font-semibold">Environment Variables</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${theme === 'dark' ? 'border-white/10' : 'border-neutral-200'}`}>
                      <th className="pb-3 text-left font-medium">Variable</th>
                      <th className="pb-3 text-left font-medium">Values</th>
                      <th className="pb-3 text-left font-medium">Default</th>
                      <th className="pb-3 text-left font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className={theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}>
                    <tr className={`border-b ${theme === 'dark' ? 'border-white/5' : 'border-neutral-100'}`}>
                      <td className="py-3">
                        <code className="text-emerald-400">PROVIDER</code>
                      </td>
                      <td className="py-3">puter, chatgpt, opencode</td>
                      <td className="py-3">puter</td>
                      <td className="py-3">Which AI provider to use</td>
                    </tr>
                    <tr className={`border-b ${theme === 'dark' ? 'border-white/5' : 'border-neutral-100'}`}>
                      <td className="py-3">
                        <code className="text-emerald-400">OPENAI_SERVER_HTTPS</code>
                      </td>
                      <td className="py-3">true, false</td>
                      <td className="py-3">true</td>
                      <td className="py-3">Enable shared HTTPS for Vite and Express</td>
                    </tr>
                    <tr className={`border-b ${theme === 'dark' ? 'border-white/5' : 'border-neutral-100'}`}>
                      <td className="py-3">
                        <code className="text-emerald-400">OPENAI_SERVER_HTTPS_KEY_FILE</code>
                      </td>
                      <td className="py-3">File path</td>
                      <td className="py-3">.cert/dev.pem</td>
                      <td className="py-3">mkcert private-key path</td>
                    </tr>
                    <tr>
                      <td className="py-3">
                        <code className="text-emerald-400">OPENAI_SERVER_HTTPS_CERT_FILE</code>
                      </td>
                      <td className="py-3">File path</td>
                      <td className="py-3">.cert/cert.pem</td>
                      <td className="py-3">mkcert certificate path</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Frontend Configuration */}
            <div
              className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
              }`}>
              <h3 className="text-lg font-semibold">Frontend Configuration</h3>
              <p className={`mt-2 text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>
                The frontend selects its API backend in this order:
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5">
                <li className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  API base URL saved in the chat settings.
                </li>
                <li className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  <code className="text-emerald-400">VITE_BACKEND_HOSTNAME_DEV</code> while running the Vite development
                  server.
                </li>
                <li className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  <code className="text-emerald-400">VITE_BACKEND_HOSTNAME_PROD</code> in a production build.
                </li>
                <li className={`text-sm ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  The current browser origin.
                </li>
              </ol>
            </div>

            {/* Example Configuration */}
            <div
              className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-white/10 bg-neutral-800/40' : 'border-neutral-200 bg-white'
              }`}>
              <h3 className="text-lg font-semibold">Example .env Configuration</h3>
              <div className="mt-4 overflow-x-auto">
                <pre
                  className={`rounded-lg p-4 text-sm ${
                    theme === 'dark' ? 'bg-neutral-900 text-neutral-100' : 'bg-neutral-100 text-neutral-900'
                  }`}>
                  <code>{`VITE_HOSTNAME=dev.webmanajemen.com
VITE_PORT=5173
VITE_BACKEND_HOSTNAME_DEV=127.0.0.1:5758
VITE_BACKEND_HOSTNAME_PROD=sh.webmanajemen.com
OPENAI_SERVER_HTTPS=true
OPENAI_SERVER_HTTPS_KEY_FILE=.cert/dev.pem
OPENAI_SERVER_HTTPS_CERT_FILE=.cert/cert.pem`}</code>
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className={`mt-16 border-t py-8 ${theme === 'dark' ? 'border-white/5' : 'border-neutral-200'}`}>
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className={`text-sm ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500'}`}>
            AI Toolkit Server — OpenAI-Compatible API Server
          </p>
          <div className="mt-4 flex justify-center gap-4">
            <a
              href="https://github.com/dimaslanjaka/ai-toolkit"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm transition hover:text-emerald-500 ${
                theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'
              }`}>
              <i className="fa-brands fa-github mr-1" />
              GitHub
            </a>
            <a
              href="https://platform.openai.com/docs/api-reference"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm transition hover:text-emerald-500 ${
                theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'
              }`}>
              <i className="fa-solid fa-book mr-1" />
              OpenAI Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
