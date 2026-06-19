import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createApiUrl } from '../utils/url';
import { convertAnsiToHtml } from '../utils/ansi-to-html';

type ProxyCheckerState = 'idle' | 'starting' | 'running' | 'finished' | 'failed' | 'stopped' | 'locked';
type Theme = 'dark' | 'light';

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

interface ProxyManagerProps {
  apiBase: string;
  apiKey: string;
  theme: Theme;
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

function shortPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const marker = normalized.lastIndexOf('/tmp/');

  return marker >= 0 ? normalized.slice(marker + 1) : value;
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  theme
}: {
  icon: string;
  label: string;
  value: string;
  detail: string;
  theme: Theme;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        theme === 'dark' ? 'border-white/10 bg-white/[0.035]' : 'border-neutral-200 bg-white'
      }`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
            theme === 'dark' ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-500'
          }`}>
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

export default function ProxyManager({ apiBase, apiKey, theme }: ProxyManagerProps) {
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
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const initialLoadRef = useRef(true);

  const isActive = status ? ACTIVE_STATES.includes(status.state) : false;
  const stateMeta = STATE_META[status?.state ?? 'idle'];
  const panelClass =
    theme === 'dark'
      ? 'border-white/10 bg-[#272727] shadow-black/10'
      : 'border-neutral-200 bg-white shadow-neutral-200/50';

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

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadStatus]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => void loadStatus(true), isActive ? 2000 : 5000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, isActive, loadStatus]);

  useEffect(() => {
    if (!isActive) return;

    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    if (query || initialLoadRef.current || !logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs, query]);

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

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return logs;
    return logs.filter((line) => line.toLowerCase().includes(normalizedQuery));
  }, [logs, query]);

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
        <div className={`relative overflow-hidden rounded-3xl border p-5 shadow-xl md:p-7 ${panelClass}`}>
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
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-45 ${
                  theme === 'dark'
                    ? 'border-white/10 bg-white/5 text-neutral-200 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-red-300 hover:bg-red-50 hover:text-red-600'
                }`}>
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
                className={`inline-flex size-10 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${
                  theme === 'dark'
                    ? 'border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                    : 'border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                }`}>
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
            theme={theme}
          />
          <MetricCard
            icon="fa-microchip"
            label="Process"
            value={status?.pid ? `PID ${status.pid}` : 'No process'}
            detail={status?.pidAlive ? 'Process is responding' : 'No live process detected'}
            theme={theme}
          />
          <MetricCard
            icon="fa-stopwatch"
            label="Run time"
            value={formatDuration(status?.startedAt ?? null, status?.finishedAt ?? null, currentTime)}
            detail={status?.startedAt ? `Started ${formatDate(status.startedAt)}` : 'No run recorded yet'}
            theme={theme}
          />
          <MetricCard
            icon="fa-shield-check"
            label="Runtime lock"
            value={status?.lockExists ? 'Acquired' : 'Released'}
            detail={status?.lockExists ? 'Exclusive scan ownership' : 'Ready to acquire'}
            theme={theme}
          />
        </div>

        <div className="mt-5 grid min-h-[32rem] gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)]">
          <div className={`flex flex-col h-[38rem] overflow-hidden rounded-2xl border shadow-lg ${panelClass}`}>
            <div
              className={`flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center ${
                theme === 'dark' ? 'border-white/10' : 'border-neutral-200'
              }`}>
              <div className="flex items-center gap-2">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-red-400/80" />
                  <span className="size-2.5 rounded-full bg-amber-400/80" />
                  <span className="size-2.5 rounded-full bg-emerald-400/80" />
                </span>
                <span className="ml-1 text-sm font-semibold">Live output</span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    theme === 'dark' ? 'bg-neutral-800 text-neutral-500' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                  {logs.length} lines
                </span>
              </div>
              <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
                <label className="relative min-w-0 flex-1 sm:w-56">
                  <span className="sr-only">Filter logs</span>
                  <i
                    aria-hidden="true"
                    className="fa-solid fa-magnifying-glass pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-neutral-500"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter output"
                    className={`h-9 w-full rounded-lg border py-1.5 pr-8 pl-8 text-xs outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 ${
                      theme === 'dark'
                        ? 'border-white/10 bg-black/20 text-neutral-200 placeholder:text-neutral-600'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400'
                    }`}
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear log filter"
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-500 hover:text-neutral-300">
                      <i aria-hidden="true" className="fa-solid fa-xmark" />
                    </button>
                  ) : null}
                </label>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(filteredLogs.join('\n'))}
                  aria-label="Copy visible logs"
                  title="Copy visible logs"
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition ${
                    theme === 'dark'
                      ? 'border-white/10 text-neutral-400 hover:bg-white/5 hover:text-white'
                      : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                  }`}>
                  <i aria-hidden="true" className="fa-solid fa-copy text-xs" />
                </button>
              </div>
            </div>

            <div
              ref={logContainerRef}
              className="flex-1 min-h-0 overflow-auto bg-[#111315] p-4 font-mono text-[12px] leading-6 whitespace-pre-wrap">
              {filteredLogs.length ? (
                <pre
                  className="min-h-0"
                  dangerouslySetInnerHTML={{
                    __html: convertAnsiToHtml(filteredLogs.join('\n'))
                  }}
                />
              ) : (
                <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-neutral-600">
                    <i aria-hidden="true" className="fa-solid fa-terminal" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-neutral-400">
                    {query ? 'No matching output' : 'Waiting for checker output'}
                  </p>
                  <p className="mt-1 max-w-xs font-sans text-xs leading-5 text-neutral-600">
                    {query
                      ? 'Try a different filter term.'
                      : 'Start a scan to stream process details and proxy validation results here.'}
                  </p>
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            <div className="flex items-center gap-3 border-t border-white/10 bg-[#181a1d] px-4 py-2.5 text-[11px] text-neutral-500">
              <button
                type="button"
                role="switch"
                aria-checked={autoRefresh}
                onClick={() => setAutoRefresh((current) => !current)}
                className="inline-flex items-center gap-2 transition hover:text-neutral-300">
                <span
                  className={`relative h-4 w-7 rounded-full transition ${
                    autoRefresh ? 'bg-emerald-500/80' : 'bg-neutral-700'
                  }`}>
                  <span
                    className={`absolute top-0.5 size-3 rounded-full bg-white transition ${
                      autoRefresh ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </span>
                Auto-refresh
              </button>
              <span className="ml-auto">
                {autoRefresh ? (isActive ? 'Polling every 2s' : 'Polling every 5s') : 'Auto-refresh paused'}
              </span>
            </div>
          </div>

          <div className="space-y-5">
            <div className={`rounded-2xl border p-5 shadow-lg ${panelClass}`}>
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-xl ${
                    theme === 'dark' ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-500'
                  }`}>
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
                    className={`flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0 ${
                      theme === 'dark' ? 'border-white/5' : 'border-neutral-100'
                    }`}>
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

            <div className={`rounded-2xl border p-5 shadow-lg ${panelClass}`}>
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-xl ${
                    theme === 'dark' ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-500'
                  }`}>
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
                      className={`flex items-center gap-3 rounded-xl border p-3 ${
                        theme === 'dark' ? 'border-white/5 bg-black/10' : 'border-neutral-100 bg-neutral-50'
                      }`}>
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

            <div
              className={`rounded-2xl border p-4 text-xs leading-5 ${
                theme === 'dark'
                  ? 'border-sky-500/20 bg-sky-500/[0.07] text-sky-200/70'
                  : 'border-sky-200 bg-sky-50 text-sky-700'
              }`}>
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
