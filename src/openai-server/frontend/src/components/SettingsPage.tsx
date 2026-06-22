import { useState, useEffect } from 'react';
import { useSettings, type Provider } from '../context/SettingsContext';
import { sanitizeStoredApiBase } from '../utils/url';

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'puter', label: 'Puter' },
  { value: 'chatgpt', label: 'ChatGPT' }
];

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
              <span className="mb-2 block text-sm font-medium text-neutral-100">Provider</span>
              <select
                value={settings.provider}
                onChange={(e) => setSettings((current) => ({ ...current, provider: e.target.value as Provider }))}
                className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-emerald-500">
                {PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

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
        <div className="rounded-xl border border-white/10 bg-[#242424]">
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
      </div>
    </div>
  );
}
