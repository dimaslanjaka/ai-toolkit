import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import ProxyControl from './ProxyControl';
import ProxyList from './ProxyList';
import { createApiUrl } from '../utils/url';
interface WorkingProxy {
  id?: number;
  proxy: string;
  type?: string;
  status?: string;
  last_check?: string;
  hosts?: string[];
}

type ProxyCheckerState = 'idle' | 'starting' | 'running' | 'finished' | 'failed' | 'stopped' | 'locked';

interface ProxyCheckerStatus {
  state: ProxyCheckerState;
  pid: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  lastError: string | null;
  logFile: string;
  pidFile: string;
  lockFile: string;
  lockExists: boolean;
  pidAlive: boolean;
}

interface ProxyLogsResponse {
  ok: boolean;
  status: ProxyCheckerStatus;
  logs: string[];
}

interface ProxyActionResponse {
  ok: boolean;
  message: string;
  status: ProxyCheckerStatus;
}

interface WorkingProxiesResponse {
  ok: boolean;
  proxies: WorkingProxy[];
}

const ACTIVE_STATES: ProxyCheckerState[] = ['starting', 'running'];

const STATE_META: Record<
  ProxyCheckerState,
  { label: string; description: string; icon: string; badge: string; dot: string }
> = {
  idle: {
    label: 'Idle',
    description: 'Ready for a new proxy scan.',
    icon: 'fa-circle-pause',
    badge: 'border-neutral-500/30 bg-neutral-500/10 text-neutral-400',
    dot: 'bg-neutral-400'
  },
  starting: {
    label: 'Starting',
    description: 'Preparing the checker process.',
    icon: 'fa-spinner-third',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    dot: 'animate-pulse bg-sky-400'
  },
  running: {
    label: 'Running',
    description: 'Testing proxy candidates against OpenCode.',
    icon: 'fa-wave-pulse',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    dot: 'animate-pulse bg-emerald-400'
  },
  finished: {
    label: 'Finished',
    description: 'The latest scan completed successfully.',
    icon: 'fa-circle-check',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    dot: 'bg-emerald-400'
  },
  failed: {
    label: 'Failed',
    description: 'The checker exited with an error.',
    icon: 'fa-circle-xmark',
    badge: 'border-red-500/30 bg-red-500/10 text-red-400',
    dot: 'bg-red-400'
  },
  stopped: {
    label: 'Stopped',
    description: 'The latest scan was stopped manually.',
    icon: 'fa-octagon-stop',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    dot: 'bg-amber-400'
  },
  locked: {
    label: 'Locked',
    description: 'A stale or externally owned lock needs attention.',
    icon: 'fa-lock',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    dot: 'bg-amber-400'
  }
};

function requestHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    'X-AI-Toolkit-Frontend': 'true'
  };

  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  return headers;
}

function formatDate(value: string | null): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(new Date(value));
}

function formatDuration(startedAt: string | null, finishedAt: string | null, currentTime: number): string {
  if (!startedAt) return '—';

  const end = finishedAt ? new Date(finishedAt).getTime() : currentTime;
  const duration = Math.max(0, end - new Date(startedAt).getTime());
  const seconds = Math.floor(duration / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours) return `${hours}h ${minutes}m ${remainder}s`;
  if (minutes) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function getProtocolBadgeClasses(type: string): string {
  const base = 'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';
  switch (type.toLowerCase()) {
    case 'http':
      return `${base} border border-sky-500/20 bg-sky-500/10 text-sky-300`;
    case 'https':
      return `${base} border border-emerald-500/20 bg-emerald-500/10 text-emerald-300`;
    case 'socks4':
      return `${base} border border-amber-500/20 bg-amber-500/10 text-amber-300`;
    case 'socks4a':
      return `${base} border border-orange-500/20 bg-orange-500/10 text-orange-300`;
    case 'socks5':
      return `${base} border border-violet-500/20 bg-violet-500/10 text-violet-300`;
    case 'socks5h':
      return `${base} border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300`;
    default:
      return `${base} border border-neutral-500/20 bg-neutral-500/10 text-neutral-300`;
  }
}

function shortPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const marker = normalized.lastIndexOf('/tmp/');

  return marker >= 0 ? normalized.slice(marker + 1) : value;
}

function MetricCard({ icon, label, value, detail }: { icon: string; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-800 text-neutral-400">
          <i aria-hidden="true" className={`fa-solid ${icon}`} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold">{value}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function ProxyManager() {
  const { settings } = useSettings();
  const { apiBase, apiKey } = settings;

  const [status, setStatus] = useState<ProxyCheckerStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'start' | 'stop' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [workingProxies, setWorkingProxies] = useState<WorkingProxy[]>([]);
  const [cachedProxy, setCachedProxy] = useState<string | null>(null);
  const [settingProxy, setSettingProxy] = useState(false);
  const [proxySetNotice, setProxySetNotice] = useState('');
  const [activeTab, setActiveTab] = useState<'control' | 'list' | 'opencode'>('control');
  const initialLoadRef = useRef(true);

  const isActive = status ? ACTIVE_STATES.includes(status.state) : false;
  const stateMeta = STATE_META[status?.state ?? 'idle'];

  const loadStatus = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);

      try {
        const response = await fetch(createApiUrl('/proxy-checker/logs', { apiBase }, { limit: 500 }), {
          headers: requestHeaders(apiKey)
        });
        const payload = (await response.json()) as ProxyLogsResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(`Status request failed with ${response.status}`);
        }

        setStatus(payload.status);
        setLogs(Array.isArray(payload.logs) ? payload.logs : []);
        setError('');
        setLastUpdated(new Date());
        setCurrentTime(Date.now());
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
        initialLoadRef.current = false;
      }
    },
    [apiBase, apiKey]
  );

  const loadWorkingProxies = useCallback(async () => {
    try {
      const response = await fetch(createApiUrl('/proxy-checker/proxies', { apiBase }, { host: 'opencode.ai' }), {
        headers: requestHeaders(apiKey)
      });
      const payload = (await response.json()) as WorkingProxiesResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(`Failed to fetch proxies with ${response.status}`);
      }

      setWorkingProxies(Array.isArray(payload.proxies) ? payload.proxies : []);
    } catch (loadError) {
      console.error('Failed to load working proxies:', loadError);
      setWorkingProxies([]);
    }
  }, [apiBase, apiKey]);

  const loadCachedProxy = useCallback(async () => {
    try {
      const response = await fetch(createApiUrl('/api/settings/OPENCODE_CACHED_PROXY', { apiBase }), {
        headers: requestHeaders(apiKey)
      });
      if (!response.ok) {
        setCachedProxy(null);
        return;
      }
      const payload = (await response.json()) as { key: string; value: string };
      setCachedProxy(payload.value ?? null);
    } catch {
      setCachedProxy(null);
    }
  }, [apiBase, apiKey]);

  const setOpenCodeProxy = useCallback(
    async (proxy: string) => {
      setSettingProxy(true);
      setProxySetNotice('');
      try {
        const response = await fetch(createApiUrl('/api/settings/OPENCODE_CACHED_PROXY', { apiBase }), {
          method: 'POST',
          headers: { ...requestHeaders(apiKey), 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: proxy })
        });
        if (!response.ok) throw new Error(`Failed to set proxy: ${response.status}`);
        const payload = (await response.json()) as { success: boolean; value: string };
        if (payload.success) {
          setCachedProxy(payload.value);
          setProxySetNotice('Proxy set successfully.');
        }
      } catch (e) {
        setProxySetNotice(e instanceof Error ? e.message : 'Failed to set proxy');
      } finally {
        setSettingProxy(false);
      }
    },
    [apiBase, apiKey]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadStatus();
      void loadWorkingProxies();
      void loadCachedProxy();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadStatus, loadWorkingProxies, loadCachedProxy]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(
      () => {
        void loadStatus(true);
        void loadWorkingProxies();
        void loadCachedProxy();
      },
      isActive ? 2000 : 5000
    );
    return () => window.clearInterval(interval);
  }, [autoRefresh, isActive, loadStatus, loadWorkingProxies, loadCachedProxy]);

  useEffect(() => {
    if (!isActive) return;

    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const runAction = useCallback(
    async (nextAction: 'start' | 'stop') => {
      setAction(nextAction);
      setError('');
      setNotice('');

      try {
        const response = await fetch(createApiUrl(`/proxy-checker/${nextAction}`, { apiBase }), {
          method: 'POST',
          headers: requestHeaders(apiKey)
        });
        const payload = (await response.json()) as ProxyActionResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || `${nextAction} request failed with ${response.status}`);
        }

        setStatus(payload.status);
        setNotice(payload.message);
        await loadStatus(true);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
        await loadStatus(true);
      } finally {
        setAction(null);
      }
    },
    [apiBase, apiKey, loadStatus]
  );

  const runtimeFiles = status
    ? [
        { label: 'Process log', value: status.logFile, icon: 'fa-file-lines' },
        { label: 'PID record', value: status.pidFile, icon: 'fa-fingerprint' },
        { label: 'Process lock', value: status.lockFile, icon: 'fa-lock-keyhole' }
      ]
    : [];

  return (
    <section className="app-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-7 md:py-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#272727] p-5 shadow-xl shadow-black/10 md:p-7">
          <div
            className={`pointer-events-none absolute -top-24 -right-16 size-64 rounded-full blur-3xl ${
              isActive ? 'bg-emerald-500/15' : 'bg-sky-500/10'
            }`}
          />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${stateMeta.badge}`}>
                  <span className={`size-1.5 rounded-full ${stateMeta.dot}`} />
                  {stateMeta.label}
                </span>
                <span className="text-xs text-neutral-500">
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Connecting to server…'}
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Proxy checker control room</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
                Run and observe the OpenCode proxy scan. The checker validates candidates, records its process state,
                and persists the first working proxy for provider requests.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading || isActive || action !== null}
                onClick={() => void runAction('start')}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-45">
                <i
                  aria-hidden="true"
                  className={`fa-solid ${action === 'start' ? 'fa-spinner-third animate-spin' : 'fa-play'}`}
                />
                Start scan
              </button>
              <button
                type="button"
                disabled={!isActive || action !== null}
                onClick={() => void runAction('stop')}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-neutral-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-45">
                <i
                  aria-hidden="true"
                  className={`fa-solid ${action === 'stop' ? 'fa-spinner-third animate-spin' : 'fa-stop'}`}
                />
                Stop
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadStatus()}
                aria-label="Refresh proxy status"
                title="Refresh proxy status"
                className="inline-flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
                <i aria-hidden="true" className={`fa-solid fa-arrows-rotate ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <i aria-hidden="true" className="fa-solid fa-triangle-exclamation mt-0.5" />
            <div>
              <p className="font-semibold">Proxy manager request failed</p>
              <p className="mt-0.5 text-red-300/80">{error}</p>
            </div>
            <button
              type="button"
              className="ml-auto text-red-300/70 transition hover:text-red-200"
              onClick={() => setError('')}
              aria-label="Dismiss error">
              <i aria-hidden="true" className="fa-solid fa-xmark" />
            </button>
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            <i aria-hidden="true" className="fa-solid fa-circle-check" />
            {notice}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={stateMeta.icon}
            label="Checker state"
            value={stateMeta.label}
            detail={stateMeta.description}
          />
          <MetricCard
            icon="fa-microchip"
            label="Process"
            value={status?.pid ? `PID ${status.pid}` : 'No process'}
            detail={status?.pidAlive ? 'Process is responding' : 'No live process detected'}
          />
          <MetricCard
            icon="fa-stopwatch"
            label="Run time"
            value={formatDuration(status?.startedAt ?? null, status?.finishedAt ?? null, currentTime)}
            detail={status?.startedAt ? `Started ${formatDate(status.startedAt)}` : 'No run recorded yet'}
          />
          <MetricCard
            icon="fa-shield-check"
            label="Runtime lock"
            value={status?.lockExists ? 'Acquired' : 'Released'}
            detail={status?.lockExists ? 'Exclusive scan ownership' : 'Ready to acquire'}
          />
        </div>

        {/* Tab Switcher */}
        <div className="mb-4 flex space-x-2">
          <button
            type="button"
            className={`px-4 py-2 rounded-t-md font-medium ${activeTab === 'control' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-neutral-500'}
              `}
            onClick={() => setActiveTab('control')}>
            <i className="fa-solid fa-terminal mr-1" aria-hidden="true" /> Logs
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-t-md font-medium ${activeTab === 'list' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-neutral-500'}
              `}
            onClick={() => setActiveTab('list')}>
            <i className="fa-solid fa-network-wired mr-1" aria-hidden="true" /> Proxies
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-t-md font-medium ${activeTab === 'opencode' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-neutral-500'}
              `}
            onClick={() => setActiveTab('opencode')}>
            <i className="fa-solid fa-bolt mr-1" aria-hidden="true" /> OpenCode
          </button>
        </div>

        <div className="mt-5 grid h-[38rem] gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)]">
          {activeTab === 'control' ? (
            <ProxyControl
              status={status}
              logs={logs}
              loading={loading}
              action={action}
              error={error}
              notice={notice}
              autoRefresh={autoRefresh}
              currentTime={currentTime}
              lastUpdated={lastUpdated}
              query={query}
              setQuery={setQuery}
              setNotice={setNotice}
              setError={setError}
              setAutoRefresh={setAutoRefresh}
              runAction={runAction}
              loadStatus={loadStatus}
            />
          ) : activeTab === 'opencode' ? (
            <div className="h-full overflow-auto rounded-2xl border border-white/10 bg-[#272727] p-5 shadow-lg shadow-black/10">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-neutral-800 text-neutral-400">
                  <i aria-hidden="true" className="fa-solid fa-cloud" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">OpenCode Proxy</h2>
                  <p className="text-xs text-neutral-500">Currently cached proxy for opencode.ai</p>
                </div>
              </div>

              {cachedProxy ? (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-[10px] font-medium tracking-wide text-neutral-500 uppercase">Active proxy</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 truncate font-mono text-sm text-emerald-300">{cachedProxy}</p>
                    {(() => {
                      const proto = cachedProxy.startsWith('https://')
                        ? 'https'
                        : cachedProxy.startsWith('socks5h://')
                          ? 'socks5h'
                          : cachedProxy.startsWith('socks5://')
                            ? 'socks5'
                            : cachedProxy.startsWith('socks4a://')
                              ? 'socks4a'
                              : cachedProxy.startsWith('socks4://')
                                ? 'socks4'
                                : 'http';
                      return <span className={getProtocolBadgeClasses(proto)}>{proto}</span>;
                    })()}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-neutral-500/20 bg-neutral-500/10 p-3">
                  <p className="text-[10px] font-medium tracking-wide text-neutral-500 uppercase">Active proxy</p>
                  <p className="mt-1 text-xs text-neutral-500">No proxy cached</p>
                </div>
              )}

              {proxySetNotice && (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  {proxySetNotice}
                </div>
              )}

              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-neutral-400">Available proxies</p>
                <div className="space-y-2">
                  {workingProxies.length ? (
                    workingProxies.map((proxy, idx) => (
                      <div
                        key={`${proxy.proxy}-${idx}`}
                        className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/10 p-3">
                        <span
                          className={`size-2 shrink-0 rounded-full ${proxy.status === 'active' ? 'bg-emerald-400' : 'bg-neutral-500'}`}
                        />
                        <p className="min-w-0 flex-1 truncate font-mono text-xs">{proxy.proxy}</p>
                        {proxy.type && <span className={getProtocolBadgeClasses(proxy.type)}>{proxy.type}</span>}
                        <button
                          type="button"
                          disabled={settingProxy}
                          onClick={() => {
                            const fullUrl = proxy.type ? `${proxy.type}://${proxy.proxy}` : `http://${proxy.proxy}`;
                            void setOpenCodeProxy(fullUrl);
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-neutral-300 transition hover:bg-emerald-500/20 hover:text-emerald-300 disabled:opacity-40"
                          aria-label={`Use proxy ${proxy.proxy}`}>
                          {settingProxy ? <i aria-hidden="true" className="fa-solid fa-spinner animate-spin" /> : 'Use'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs leading-5 text-neutral-500">
                      No proxies found. Run a scan to discover working proxies for opencode.ai.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <ProxyList workingProxies={workingProxies} />
          )}

          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[#272727] p-5 shadow-lg shadow-black/10">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-neutral-800 text-neutral-400">
                  <i aria-hidden="true" className="fa-solid fa-timeline" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Latest run</h2>
                  <p className="text-xs text-neutral-500">Process lifecycle details</p>
                </div>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                {[
                  ['Started', formatDate(status?.startedAt ?? null)],
                  ['Finished', formatDate(status?.finishedAt ?? null)],
                  [
                    'Exit code',
                    status?.exitCode === null || status?.exitCode === undefined ? '—' : String(status.exitCode)
                  ],
                  ['Signal', status?.signal ?? '—']
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>

              {status?.lastError ? (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-300">
                  {status.lastError}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#272727] p-5 shadow-lg shadow-black/10">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-neutral-800 text-neutral-400">
                  <i aria-hidden="true" className="fa-solid fa-folder-tree" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Runtime files</h2>
                  <p className="text-xs text-neutral-500">Local checker artifacts</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {runtimeFiles.length ? (
                  runtimeFiles.map((file) => (
                    <div
                      key={file.label}
                      title={file.value}
                      className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 p-3">
                      <i aria-hidden="true" className={`fa-solid ${file.icon} w-4 text-neutral-500`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{file.label}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-neutral-500">
                          {shortPath(file.value)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-neutral-500">Runtime paths appear after the server responds.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.07] p-4 text-xs leading-5 text-sky-200/70">
              <div className="flex gap-3">
                <i aria-hidden="true" className="fa-solid fa-circle-info mt-0.5 text-sky-400" />
                <p>
                  The checker saves a working OpenCode proxy to the SQLite proxy database. Provider requests can then
                  reuse the last successful proxy from the persistent cache.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
