export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  status: 'complete' | 'streaming' | 'stopped' | 'error';
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ModelEntry {
  id: string;
  owned_by?: string;
}
