import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router';
import { SettingsProvider } from './context/SettingsContext';
import Chat from './components/Chat';
import HomePage from './components/HomePage';
import Layout from './components/Layout';
import ProxyManager from './components/ProxyLogs';
import ModelManager from './components/ModelManager';
import SettingsPage from './components/SettingsPage';

const PAGE_TITLES: Record<string, string> = {
  '/': 'AI Toolkit Server',
  '/home': 'AI Toolkit Server',
  '/chat': 'Chat — AI Toolkit',
  '/proxy-manager': 'Proxy Manager — AI Toolkit',
  '/model-manager': 'Model Manager — AI Toolkit',
  '/settings': 'Settings — AI Toolkit'
};

function PageTitleSetter() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = PAGE_TITLES[pathname] || 'AI Toolkit';
  }, [pathname]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <PageTitleSetter />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/home" element={<HomePage />} />
          <Route element={<Layout />}>
            <Route path="/chat" element={<Chat />} />
            <Route path="/proxy-manager" element={<ProxyManager />} />
            <Route path="/model-manager" element={<ModelManager />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>
);
