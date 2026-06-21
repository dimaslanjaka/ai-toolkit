interface WorkingProxy {
  id?: number;
  proxy: string;
  type?: string;
  status?: string;
  last_check?: string;
  hosts?: string[];
}

interface ProxyListProps {
  workingProxies: WorkingProxy[];
}

function getProtocolBadgeClasses(type: string): string {
  const base = 'ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';
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

function getHostBadgeClasses(host: string): string {
  const base = 'rounded border px-1.5 py-0.5 text-[9px] font-medium';
  const colors = [
    'border-sky-500/20 bg-sky-500/10 text-sky-300',
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    'border-amber-500/20 bg-amber-500/10 text-amber-300',
    'border-violet-500/20 bg-violet-500/10 text-violet-300',
    'border-rose-500/20 bg-rose-500/10 text-rose-300',
    'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
    'border-pink-500/20 bg-pink-500/10 text-pink-300',
    'border-teal-500/20 bg-teal-500/10 text-teal-300'
  ];
  const index = host.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return `${base} ${colors[index]}`;
}

export default function ProxyList({ workingProxies }: ProxyListProps) {
  return (
    <div className="h-full overflow-auto rounded-2xl border border-white/10 bg-[#272727] p-5 shadow-lg shadow-black/10">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-neutral-800 text-neutral-400">
          <i aria-hidden="true" className="fa-solid fa-network-wired" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Working proxies</h2>
          <p className="text-xs text-neutral-500">Validated for opencode.ai</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {workingProxies.length ? (
          workingProxies.map((proxy, idx) => (
            <div
              key={`${proxy.proxy}-${idx}`}
              title={`Last checked: ${proxy.last_check || 'Unknown'}`}
              className="flex flex-col gap-2 rounded-xl border border-white/5 bg-black/10 p-3">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${proxy.status === 'active' ? 'bg-emerald-400' : 'bg-neutral-500'}`}
                />
                <p className="min-w-0 truncate font-mono text-xs font-medium">{proxy.proxy}</p>
                {proxy.type && <span className={getProtocolBadgeClasses(proxy.type)}>{proxy.type}</span>}
              </div>
              {proxy.hosts && proxy.hosts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {proxy.hosts.map((h) => (
                    <span key={h} className={getHostBadgeClasses(h)}>
                      {h}
                    </span>
                  ))}
                </div>
              )}
              {proxy.last_check && (
                <p className="text-[10px] text-neutral-500">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  }).format(new Date(proxy.last_check))}
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs leading-5 text-neutral-500">
            No working proxies yet. Run a scan to validate candidates.
          </p>
        )}
      </div>
    </div>
  );
}
