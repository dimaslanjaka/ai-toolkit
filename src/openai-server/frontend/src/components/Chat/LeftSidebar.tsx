interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  status: 'complete' | 'streaming' | 'stopped' | 'error';
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface LeftSidebarProps {
  sidebarOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameStart: (conversation: Conversation) => void;
  renamingId: string | null;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
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

export default function LeftSidebar({
  sidebarOpen,
  onClose,
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameStart,
  renamingId,
  renameValue,
  onRenameValueChange,
  onRenameConfirm,
  onRenameCancel
}: LeftSidebarProps) {
  return (
    <>
      {/* Mobile hamburger button */}
      <div className="fixed top-16 left-4 z-50 lg:hidden">
        <IconButton
          label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          onClick={() => (sidebarOpen ? onClose() : void 0)}
          className={sidebarOpen ? 'hidden' : ''}>
          <i aria-hidden="true" className="fa-solid fa-bars" />
        </IconButton>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col bg-[#171717] text-neutral-100 transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Header with New Chat */}
        <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-3">
          <button
            type="button"
            onClick={onNewChat}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <span className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-xs shrink-0">
              <i aria-hidden="true" className="fa-solid fa-plus" />
            </span>
            <span className="truncate text-neutral-200">New chat</span>
          </button>
          <IconButton label="Close sidebar" onClick={onClose} className="lg:hidden shrink-0">
            <i aria-hidden="true" className="fa-solid fa-xmark" />
          </IconButton>
        </div>

        {/* Conversation list */}
        <nav className="app-scrollbar flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {conversations.map((conversation) => {
            const isActiveConversation = conversation.id === activeId;
            const isRenaming = renamingId === conversation.id;
            const isStreaming = conversation.messages.some((msg) => msg.status === 'streaming');
            const updatedAt = new Date(conversation.updatedAt);
            const dateLabel = updatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            return (
              <div
                key={conversation.id}
                className={`group relative rounded-lg transition ${isActiveConversation ? 'bg-neutral-800' : 'hover:bg-neutral-800/50'}`}>
                {isRenaming ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => onRenameValueChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onRenameConfirm();
                        if (e.key === 'Escape') onRenameCancel();
                      }}
                      onBlur={onRenameConfirm}
                      autoFocus
                      className="min-w-0 flex-1 bg-neutral-700 text-sm outline-none rounded px-2 py-1"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left">
                    {isStreaming ? (
                      <i
                        aria-hidden="true"
                        className="fa-solid fa-spinner w-4 shrink-0 text-emerald-400 animate-spin"
                      />
                    ) : (
                      <i aria-hidden="true" className="fa-solid fa-message w-4 shrink-0 text-neutral-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-neutral-200">{conversation.title}</div>
                      <div className="text-[10px] text-neutral-500">{dateLabel}</div>
                    </div>
                  </button>
                )}
                {isActiveConversation && !isRenaming && (
                  <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onRenameStart(conversation)}
                      className="rounded p-1 text-neutral-400 transition hover:bg-neutral-600 hover:text-neutral-200"
                      aria-label={`Rename ${conversation.title}`}>
                      <i aria-hidden="true" className="fa-solid fa-pen text-xs" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteConversation(conversation.id)}
                      className="rounded p-1 text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                      aria-label={`Delete ${conversation.title}`}>
                      <i aria-hidden="true" className="fa-solid fa-trash text-xs" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
