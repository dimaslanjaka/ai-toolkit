import { useState, useEffect } from 'react';
import { useSettings, type Provider } from '../context/SettingsContext';
import { sanitizeStoredApiBase } from '../utils/url';
import {
  PROVIDER_OPCODE,
  PROVIDER_PUTER,
  PROVIDER_CHATGPT,
  DEFAULT_PROVIDER,
  DEFAULT_ORDER_PROVIDERS
} from '../../../constant.js';

interface RtkState {
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export default function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const [rtk, setRtk] = useState<RtkState>({
    enabled: false,
    loading: true,
    saving: false,
    error: null
  });

  const [providerChain, setProviderChain] = useState<{
    defaultProvider: Provider | '';
    fallbackOrder: Provider[];
    loading: boolean;
    saving: boolean;
    error: string | null;
  }>({
    defaultProvider: DEFAULT_PROVIDER as Provider,
    fallbackOrder: [...DEFAULT_ORDER_PROVIDERS] as Provider[],
    loading: true,
    saving: false,
    error: null
  });

  const [providers, setProviders] = useState<{
    list: Array<{ provider: string; enabled: boolean }>;
    loading: boolean;
    saving: boolean;
    error: string | null;
  }>({
    list: [],
    loading: true,
    saving: false,
    error: null
  });

  // Fetch RTK setting on mount
  useEffect(() => {
    const fetchRtk = async () => {
      try {
        setRtk((prev) => ({ ...prev, error: null }));
        const response = await fetch('/api/settings/RTK_ENABLED');
        if (!response.ok) throw new Error('Failed to fetch RTK setting');
        const data = await response.json();
        setRtk((prev) => ({
          ...prev,
          enabled: data.value === true || data.value === 'true',
          loading: false
        }));
      } catch (err) {
        setRtk((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Unknown error',
          loading: false
        }));
      }
    };
    fetchRtk();
  }, []);

  // Fetch provider settings
  useEffect(() => {
    const fetchProviderSettings = async () => {
      try {
        const [defaultRes, orderRes] = await Promise.all([
          fetch('/api/settings/DEFAULT_PROVIDER'),
          fetch('/api/settings/FALLBACK_ORDER')
        ]);

        let defaultProvider: Provider | '' = DEFAULT_PROVIDER as Provider;
        let fallbackOrder: Provider[] = [...DEFAULT_ORDER_PROVIDERS] as Provider[];

        if (defaultRes.ok) {
          const data = await defaultRes.json();
          defaultProvider = (data.value as Provider) || (DEFAULT_PROVIDER as Provider);
        }

        if (orderRes.ok) {
          const data = await orderRes.json();
          try {
            const parsed = JSON.parse(data.value);
            if (Array.isArray(parsed) && parsed.length > 0) {
              fallbackOrder = parsed;
            }
          } catch {}
        }

        setProviderChain((prev) => ({
          ...prev,
          defaultProvider,
          fallbackOrder,
          loading: false
        }));
      } catch (err) {
        setProviderChain((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load provider settings'
        }));
      }
    };

    fetchProviderSettings();
  }, []);

  // Fetch provider enabled states
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await fetch('/api/providers');
        if (!response.ok) throw new Error('Failed to fetch providers');
        const data = await response.json();
        setProviders((prev) => ({
          ...prev,
          list: data.providers || [],
          loading: false
        }));
      } catch (err) {
        setProviders((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load providers'
        }));
      }
    };

    fetchProviders();
  }, []);

  const handleRtkToggle = async () => {
    const newValue = !rtk.enabled;
    setRtk((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const response = await fetch('/api/settings/RTK_ENABLED', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue })
      });
      if (!response.ok) throw new Error('Failed to save RTK setting');
      setRtk((prev) => ({ ...prev, enabled: newValue, saving: false }));
    } catch (err) {
      setRtk((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        enabled: !newValue
      }));
    }
  };

  const handleDefaultProviderChange = async (value: Provider) => {
    setProviderChain((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const response = await fetch('/api/settings/DEFAULT_PROVIDER', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      if (!response.ok) throw new Error('Failed to save default provider');
      setProviderChain((prev) => ({ ...prev, defaultProvider: value, saving: false }));
    } catch (err) {
      setProviderChain((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }));
    }
  };

  const handleFallbackOrderSave = async (order: Provider[]) => {
    setProviderChain((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const response = await fetch('/api/settings/FALLBACK_ORDER', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(order) })
      });
      if (!response.ok) throw new Error('Failed to save fallback order');
      setProviderChain((prev) => ({ ...prev, fallbackOrder: order, saving: false }));
    } catch (err) {
      setProviderChain((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }));
    }
  };

  const handleProviderToggle = async (provider: string, enabled: boolean) => {
    setProviders((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const response = await fetch(`/api/providers/${provider}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!response.ok) throw new Error(`Failed to toggle ${provider}`);
      setProviders((prev) => ({
        ...prev,
        list: prev.list.map((p) => (p.provider === provider ? { ...p, enabled } : p)),
        saving: false
      }));
    } catch (err) {
      setProviders((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }));
    }
  };

  const moveProvider = (index: number, direction: 'up' | 'down') => {
    const order = [...providerChain.fallbackOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
    handleFallbackOrderSave(order);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-100">Settings</h1>
          <p className="mt-1 text-sm text-neutral-400">Configure server features and connection preferences.</p>
        </div>

        {/* Connection settings */}
        <div className="mb-6 rounded-xl border border-white/10 bg-[#242424]">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-medium text-neutral-100">Connection</h2>
            <p className="mt-0.5 text-xs text-neutral-400">Saved only in this browser.</p>
          </div>
          <div className="space-y-5 p-6">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-100">API base URL</span>
              <input
                type="url"
                value={settings.apiBase}
                placeholder="Optional absolute URL"
                onChange={(e) => setSettings((current) => ({ ...current, apiBase: e.target.value }))}
                onBlur={(e) =>
                  setSettings((current) => ({ ...current, apiBase: sanitizeStoredApiBase(e.target.value) }))
                }
                className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500"
              />
              <span className="mt-1.5 block text-xs text-neutral-400">
                Only complete HTTP(S) URLs are accepted. Leave empty to use the environment backend hostname.
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-100">Bearer token</span>
              <input
                type="password"
                value={settings.apiKey}
                placeholder="Optional"
                autoComplete="off"
                onChange={(e) => setSettings((current) => ({ ...current, apiKey: e.target.value }))}
                className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500"
              />
              <span className="mt-1.5 block text-xs text-amber-500">
                The current server records this token but does not validate it.
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-100">System prompt</span>
              <textarea
                value={settings.systemPrompt}
                rows={6}
                placeholder="Optional instructions sent before the conversation"
                onChange={(e) => setSettings((current) => ({ ...current, systemPrompt: e.target.value }))}
                className="app-scrollbar block w-full resize-y rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500"
              />
              <span className="mt-1.5 block text-xs text-neutral-400">
                Prepended as a <code className="text-emerald-400">system</code> role message to every chat completion
                request sent to the upstream provider.
              </span>
            </label>
          </div>
        </div>

        {/* Feature settings */}
        <div className="mb-6 rounded-xl border border-white/10 bg-[#242424]">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-medium text-neutral-100">Features</h2>
          </div>
          <div className="p-6">
            {rtk.loading && (
              <div className="flex items-center justify-center py-8">
                <i aria-hidden="true" className="fa-solid fa-spinner animate-spin text-lg text-emerald-500" />
                <span className="ml-2 text-sm text-neutral-400">Loading settings...</span>
              </div>
            )}

            {rtk.error && !rtk.loading && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-start gap-3">
                  <i aria-hidden="true" className="fa-solid fa-exclamation-circle mt-0.5 flex-shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Error</p>
                    <p className="mt-0.5 text-xs text-red-300">{rtk.error}</p>
                  </div>
                </div>
              </div>
            )}

            {!rtk.loading && (
              <label className="flex cursor-pointer items-center gap-4 rounded-lg p-4 transition hover:bg-neutral-700/30">
                <div
                  className="relative flex h-6 w-11 items-center rounded-full bg-neutral-700 transition"
                  role="switch"
                  aria-checked={rtk.enabled}>
                  <input
                    type="checkbox"
                    checked={rtk.enabled}
                    onChange={handleRtkToggle}
                    disabled={rtk.saving}
                    className="peer sr-only"
                    aria-label="RTK Enabled"
                  />
                  <span
                    className={`absolute left-1 h-4 w-4 rounded-full transition ${rtk.enabled ? 'translate-x-5 bg-emerald-500' : 'bg-neutral-500'} ${rtk.saving ? 'opacity-50' : ''}`}
                  />
                </div>
                <div className="flex-1">
                  <span className="block text-sm font-medium text-neutral-100">RTK (Redux Toolkit)</span>
                  <p className="mt-1 text-xs text-neutral-400">
                    Enable Redux Toolkit integration for state management.
                  </p>
                </div>
                {rtk.saving && (
                  <i aria-hidden="true" className="fa-solid fa-spinner animate-spin text-sm text-emerald-500" />
                )}
              </label>
            )}
          </div>
        </div>

        {/* Provider Chain settings */}
        <div className="rounded-xl border border-white/10 bg-[#242424]">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-medium text-neutral-100">Provider Chain</h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              Configure the default provider and fallback order for server-side requests.
            </p>
          </div>
          <div className="p-6">
            {providerChain.loading && (
              <div className="flex items-center justify-center py-8">
                <i aria-hidden="true" className="fa-solid fa-spinner animate-spin text-lg text-emerald-500" />
                <span className="ml-2 text-sm text-neutral-400">Loading provider settings...</span>
              </div>
            )}

            {providerChain.error && !providerChain.loading && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-start gap-3">
                  <i aria-hidden="true" className="fa-solid fa-exclamation-circle mt-0.5 flex-shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Error</p>
                    <p className="mt-0.5 text-xs text-red-300">{providerChain.error}</p>
                  </div>
                </div>
              </div>
            )}

            {!providerChain.loading && (
              <div className="space-y-6">
                {/* Default provider */}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-neutral-100">Default provider</span>
                  <label className="relative">
                    <select
                      value={providerChain.defaultProvider}
                      disabled={providerChain.saving}
                      onChange={(e) => handleDefaultProviderChange(e.target.value as Provider)}
                      className="appearance-none block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 pr-8 text-sm text-white focus:border-emerald-500 focus:ring-emerald-500 disabled:opacity-50">
                      <option value={PROVIDER_OPCODE}>OpenCode</option>
                      <option value={PROVIDER_PUTER}>Puter</option>
                      <option value={PROVIDER_CHATGPT}>ChatGPT</option>
                    </select>
                    <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-neutral-500">
                      ▾
                    </span>
                  </label>
                  <span className="mt-1.5 block text-xs text-neutral-400">
                    Used when no X-Request-Provider header is sent. The first provider tried in the fallback chain.
                  </span>
                </label>

                {/* Fallback order */}
                <div>
                  <span className="mb-2 block text-sm font-medium text-neutral-100">Fallback order</span>
                  <p className="mb-3 text-xs text-neutral-400">
                    Providers are tried in order. Drag or use the buttons to reorder.
                  </p>
                  <div className="space-y-2">
                    {providerChain.fallbackOrder.map((provider, index) => (
                      <div
                        key={provider}
                        className="flex items-center gap-3 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-neutral-700 text-xs text-neutral-400">
                          {index + 1}
                        </span>
                        <span className="flex-1 text-sm text-white capitalize">{provider}</span>
                        <button
                          type="button"
                          disabled={index === 0 || providerChain.saving}
                          onClick={() => moveProvider(index, 'up')}
                          className="flex h-7 w-7 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Move ${provider} up`}>
                          <i aria-hidden="true" className="fa-solid fa-chevron-up text-xs" />
                        </button>
                        <button
                          type="button"
                          disabled={index === providerChain.fallbackOrder.length - 1 || providerChain.saving}
                          onClick={() => moveProvider(index, 'down')}
                          className="flex h-7 w-7 items-center justify-center rounded text-neutral-400 transition hover:bg-neutral-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Move ${provider} down`}>
                          <i aria-hidden="true" className="fa-solid fa-chevron-down text-xs" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {providerChain.saving && (
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <i aria-hidden="true" className="fa-solid fa-spinner animate-spin text-emerald-500" />
                    Saving...
                  </div>
                )}

                {/* Provider toggles */}
                <div className="mt-6">
                  <span className="mb-2 block text-sm font-medium text-neutral-100">Provider enabled</span>
                  {providers.loading && (
                    <div className="flex items-center py-2">
                      <i aria-hidden="true" className="fa-solid fa-spinner animate-spin text-emerald-500" />
                      <span className="ml-2 text-sm text-neutral-400">Loading providers...</span>
                    </div>
                  )}
                  {providers.error && (
                    <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                      <p className="text-xs text-red-400">{providers.error}</p>
                    </div>
                  )}
                  {!providers.loading &&
                    providers.list.map((p) => (
                      <label
                        key={p.provider}
                        className="flex cursor-pointer items-center gap-4 rounded-lg p-4 transition hover:bg-neutral-700/30">
                        <div
                          className="relative flex h-6 w-11 items-center rounded-full bg-neutral-700 transition"
                          role="switch"
                          aria-checked={p.enabled}>
                          <input
                            type="checkbox"
                            checked={p.enabled}
                            disabled={providers.saving}
                            onChange={() => handleProviderToggle(p.provider, !p.enabled)}
                            className="peer sr-only"
                            aria-label={`Toggle ${p.provider}`}
                          />
                          <span
                            className={`absolute left-1 h-4 w-4 rounded-full transition ${p.enabled ? 'translate-x-5 bg-emerald-500' : 'bg-neutral-500'} ${providers.saving ? 'opacity-50' : ''}`}
                          />
                        </div>
                        <span className="flex-1 text-sm font-medium text-neutral-100 capitalize">{p.provider}</span>
                        {providers.saving && (
                          <i aria-hidden="true" className="fa-solid fa-spinner animate-spin text-sm text-emerald-500" />
                        )}
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
