interface WorkingProxy {
  id?: number;
  proxy: string;
  type?: string;
  status?: string;
  last_check?: string;
}

interface ProxyListProps {
  workingProxies: WorkingProxy[];
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
                {proxy.type && (
                  <span className="ml-auto rounded-md bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400">
                    {proxy.type}
                  </span>
                )}
              </div>
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
