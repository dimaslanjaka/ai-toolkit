import { NavLink, Outlet, useLocation } from 'react-router';

const NAV_ITEMS = [
  { path: '/chat', label: 'Chat', icon: 'fa-comments' },
  { path: '/proxy-manager', label: 'Proxy manager', icon: 'fa-network-wired' },
  { path: '/model-manager', label: 'Models', icon: 'fa-cubes' },
  { path: '/settings', label: 'Settings', icon: 'fa-gear' }
];

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#212121] text-neutral-100">
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-white/5 bg-[#212121]/90 px-3 backdrop-blur md:px-4">
          <NavLink
            to="/home"
            className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <span className="text-lg font-semibold">AI Toolkit</span>
          </NavLink>

          <nav className="ml-6 hidden items-center gap-4 lg:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={`px-3 py-2 text-sm font-medium transition ${isActive(item.path) ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-100'}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex h-14 shrink-0 items-center justify-around border-t border-white/5 bg-[#171717] lg:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 transition ${isActive(item.path) ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-100'}`}>
            <i aria-hidden="true" className={`fa-solid ${item.icon}`} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
