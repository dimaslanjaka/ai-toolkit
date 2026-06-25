import { useCallback, useState } from 'react';
import { createApiUrl } from '../utils/url';

interface WorkingProxy {
  id?: number;
  proxy: string;
  type?: string;
  status?: string;
  last_check?: string;
  hosts?: string[];
}

interface ProxyOpenCodeProps {
  cachedProxy: string | null;
  workingProxies: WorkingProxy[];
  apiBase: string;
  apiKey: string;
  onProxySet: (proxy: string) => void;
}

function requestHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    'X-AI-Toolkit-Frontend': 'true'
  };

  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  return headers;
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

export default function ProxyOpenCode({
  cachedProxy,
  workingProxies,
  apiBase,
  apiKey,
  onProxySet
}: ProxyOpenCodeProps) {
  const [settingProxy, setSettingProxy] = useState(false);
  const [proxySetNotice, setProxySetNotice] = useState('');

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
          onProxySet(payload.value);
          setProxySetNotice('Proxy set successfully.');
        }
      } catch (e) {
        setProxySetNotice(e instanceof Error ? e.message : 'Failed to set proxy');
      } finally {
        setSettingProxy(false);
      }
    },
    [apiBase, apiKey, onProxySet]
  );
  return (
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
  );
}
