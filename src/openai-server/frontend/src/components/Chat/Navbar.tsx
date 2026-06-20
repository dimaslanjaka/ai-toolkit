interface NavbarProps {
  onMenuClick: () => void;
  conversationTitle?: string;
  connectionState: 'checking' | 'online' | 'offline';
}

function IconButton({
  label,
  onClick,
  children,
  className = ''
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
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

export default function Navbar({ onMenuClick, conversationTitle, connectionState }: NavbarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-white/5 bg-[#171717] px-3 backdrop-blur lg:hidden">
      <IconButton label="Open sidebar" onClick={onMenuClick}>
        <i aria-hidden="true" className="fa-solid fa-bars" />
      </IconButton>

      {conversationTitle && (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">{conversationTitle}</span>
      )}

      <span
        className={`ml-auto flex items-center gap-1.5 text-xs ${
          connectionState === 'online'
            ? 'text-emerald-400'
            : connectionState === 'checking'
              ? 'text-amber-400'
              : 'text-neutral-500'
        }`}>
        <i
          aria-hidden="true"
          className={`fa-solid ${connectionState === 'online' ? 'fa-plug-circle-check' : 'fa-circle-exclamation'}`}
        />
        <span className="sr-only">
          {connectionState === 'online'
            ? 'Connected'
            : connectionState === 'checking'
              ? 'Checking connection'
              : 'Server offline'}
        </span>
      </span>
    </header>
  );
}
