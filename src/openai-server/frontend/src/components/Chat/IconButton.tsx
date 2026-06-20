import React from 'react';

export function IconButton({
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
