import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { sanitizeStoredApiBase } from '../utils/url';

type Provider = 'auto' | 'opencode' | 'puter' | 'chatgpt';
type Theme = 'dark' | 'light';

interface ChatSettings {
  apiBase: string;
  apiKey: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  theme: Theme;
}

interface SettingsContextValue {
  settings: ChatSettings;
  setSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
}

const STORAGE_KEY = 'ai-toolkit-chat-state-v1';
const DEFAULT_MODEL = '';

const DEFAULT_SETTINGS: ChatSettings = {
  apiBase: '',
  apiKey: '',
  provider: 'auto',
  model: DEFAULT_MODEL,
  systemPrompt: '',
  theme: 'dark'
};

function getInitialSettings(): ChatSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { settings?: Partial<ChatSettings> };
      return {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
        apiBase: sanitizeStoredApiBase(parsed.settings?.apiBase ?? '')
      };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_SETTINGS;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ChatSettings>(getInitialSettings);

  useEffect(() => {
    document.documentElement.classList.toggle('light', settings.theme === 'light');
  }, [settings.theme]);

  const value = useMemo(() => ({ settings, setSettings }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export type { ChatSettings, Theme, Provider };
export { DEFAULT_SETTINGS, STORAGE_KEY };
