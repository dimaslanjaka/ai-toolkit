import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import { SettingsProvider } from './context/SettingsContext';
import Chat from './components/Chat';
import HomePage from './components/HomePage';
import Layout from './components/Layout';
import ProxyManager from './components/ProxyLogs';
import ModelManager from './components/ModelManager';
import SettingsPage from './components/SettingsPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
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
