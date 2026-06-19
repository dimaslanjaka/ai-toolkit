import { useRef, useEffect, useMemo } from 'react';
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

interface ProxyControlProps {
  status: ProxyCheckerStatus | null;
  logs: string[];
  loading: boolean;
  action: 'start' | 'stop' | null;
  error: string;
  notice: string;
  autoRefresh: boolean;
  currentTime: number;
  lastUpdated: Date | null;
  query: string;
  setQuery: (q: string) => void;
  setNotice: (n: string) => void;
  setError: (e: string) => void;
  setAutoRefresh: (ar: boolean) => void;
  runAction: (action: 'start' | 'stop') => Promise<void>;
  loadStatus: () => Promise<void>;
  theme: Theme;
}

export default function ProxyControl({
  status,
  logs,
  loading: _loading,
  action: _action,
  error: _error,
  notice,
  autoRefresh,
  currentTime: _currentTime,
  lastUpdated: _lastUpdated,
  query,
  setQuery,
  setNotice,
  setError: _setError,
  setAutoRefresh,
  runAction: _runAction,
  loadStatus: _loadStatus,
  theme
}: ProxyControlProps) {
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const initialLoadRef = useRef(true);

  const panelClass =
    theme === 'dark'
      ? 'border-white/10 bg-[#272727] shadow-black/10'
      : 'border-neutral-200 bg-white shadow-neutral-200/50';

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return logs;
    return logs.filter((line) => line.toLowerCase().includes(normalizedQuery));
  }, [logs, query]);

  useEffect(() => {
    if (query || initialLoadRef.current || !logContainerRef.current) return;
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [logs, query]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice, setNotice]);

  return (
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
          onClick={() => setAutoRefresh(!autoRefresh)}
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
          {autoRefresh
            ? status?.state === 'running' || status?.state === 'starting'
              ? 'Polling every 2s'
              : 'Polling every 5s'
            : 'Auto-refresh paused'}
        </span>
      </div>
    </div>
  );
}
