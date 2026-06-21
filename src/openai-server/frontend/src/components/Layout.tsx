import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router';
import { useSettings, type Provider } from '../context/SettingsContext';
import { sanitizeStoredApiBase } from '../utils/url';

const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'puter', label: 'Puter' },
  { value: 'chatgpt', label: 'ChatGPT' }
];

const NAV_ITEMS = [
  { path: '/chat', label: 'Chat', icon: 'fa-comments' },
  { path: '/proxy-manager', label: 'Proxy manager', icon: 'fa-network-wired' },
  { path: '/model-manager', label: 'Models', icon: 'fa-cubes' }
];

function IconButton({
  label,
  onClick,
  children,
  className = ''
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
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

export default function Layout() {
  const { settings, setSettings } = useSettings();
  const _navigate = useNavigate();
  const location = useLocation();
  const [_sidebarOpen, _setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#212121] text-neutral-100">
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-white/5 bg-[#212121]/90 px-3 backdrop-blur md:px-4">
          <NavLink
            to="/home"
            className="flex items-center gap-2 transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-lg px-2 py-1">
            <span className="text-lg font-semibold">AI Toolkit</span>
          </NavLink>

          <nav className="hidden lg:flex items-center gap-4 ml-6">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={`px-3 py-2 text-sm font-medium transition ${isActive(item.path) ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-100'}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Open settings" onClick={() => setSettingsOpen(true)}>
              <i aria-hidden="true" className="fa-solid fa-gear" />
            </IconButton>
          </div>
        </header>

        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex h-14 shrink-0 items-center justify-around border-t border-white/5 bg-[#171717] lg:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition ${isActive(item.path) ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-100'}`}>
            <i aria-hidden="true" className={`fa-solid ${item.icon}`} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="layout-settings-title">
          <div className="app-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#242424] text-neutral-100 shadow-2xl">
            <div className="flex items-center border-b border-white/10 px-5 py-4">
              <div>
                <h2 id="layout-settings-title" className="font-semibold">
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
                    setSettings((current) => ({ ...current, provider: event.target.value as Provider }))
                  }
                  className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-emerald-500">
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
                  className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500"
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
                  className="block w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500"
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
                  className="app-scrollbar block w-full resize-y rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:ring-emerald-500"
                />
              </label>
            </div>

            <div className="flex justify-end border-t border-white/10 px-5 py-4">
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
