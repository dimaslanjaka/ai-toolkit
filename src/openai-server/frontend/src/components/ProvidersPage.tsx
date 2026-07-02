import { Link } from 'react-router';

interface ProviderCard {
  name: string;
  icon: string;
  iconSvg?: string;
  description: string;
  status: 'active' | 'available' | 'coming-soon';
  path?: string;
}

const PROVIDERS: ProviderCard[] = [
  {
    name: 'OpenCode',
    icon: 'fa-bolt',
    iconSvg: `<svg width='24' height='30' viewBox='0 0 240 300' fill='none' xmlns='http://www.w3.org/2000/svg'><g clip-path='url(#clip0_1401_86283)'><mask id='mask0_1401_86283' style='mask-type:luminance' maskUnits='userSpaceOnUse' x='0' y='0' width='240' height='300'><path d='M240 0H0V300H240V0Z' fill='white'/></mask><g mask='url(#mask0_1401_86283)'><path d='M180 240H60V120H180V240Z' fill='#4B4646'/><path d='M180 60H60V240H180V60ZM240 300H0V0H240V300Z' fill='#F1ECEC'/></g></g><defs><clipPath id='clip0_1401_86283'><rect width='240' height='300' fill='white'/></clipPath></defs></svg>`,
    description:
      'OpenCode.ai API integration with multi-key support, per-key proxy assignment, and automatic key failover.',
    status: 'active',
    path: '/provider/opencode'
  },
  {
    name: 'Puter',
    icon: 'fa-cloud',
    description: 'Puter.com API integration.',
    status: 'available'
  },
  {
    name: 'ChatGPT',
    icon: 'fa-comment',
    description: 'OpenAI ChatGPT integration.',
    status: 'available'
  }
];

export default function ProvidersPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-100">Providers</h1>
          <p className="mt-1 text-sm text-neutral-400">Configure and manage AI provider integrations.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const card = (
              <div
                key={provider.name}
                className={`rounded-xl border bg-[#242424] p-6 transition ${
                  provider.path
                    ? 'border-white/10 hover:border-emerald-500/40 hover:bg-[#2a2a2a] cursor-pointer'
                    : 'border-white/5 opacity-70'
                }`}>
                <div className="flex items-center gap-4">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-neutral-800 text-neutral-400">
                    {provider.iconSvg ? (
                      <span dangerouslySetInnerHTML={{ __html: provider.iconSvg }} className="size-6" />
                    ) : (
                      <i aria-hidden="true" className={`fa-solid ${provider.icon} text-lg`} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-medium text-neutral-100">{provider.name}</h2>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          provider.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : provider.status === 'available'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-neutral-600/30 text-neutral-400'
                        }`}>
                        {provider.status === 'active'
                          ? 'Configured'
                          : provider.status === 'available'
                            ? 'Built-in'
                            : 'Planned'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-neutral-400 line-clamp-2">{provider.description}</p>
                  </div>
                  {provider.path && (
                    <i aria-hidden="true" className="fa-solid fa-chevron-right text-neutral-500 text-sm" />
                  )}
                </div>
              </div>
            );

            return provider.path ? (
              <Link key={provider.name} to={provider.path} className="block">
                {card}
              </Link>
            ) : (
              <div key={provider.name}>{card}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
