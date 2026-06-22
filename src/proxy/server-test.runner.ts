import { loadDotenv } from 'binary-collections';
import { startProxyServer } from './server.js';
import type { Server } from 'http';

loadDotenv();

let server: Server | null = null;

async function stopServer() {
  if (!server) return;
  console.log('\nStopping proxy server...');
  return new Promise<void>((resolve) => {
    server!.close(() => {
      console.log('Proxy server stopped.');
      resolve();
    });
  });
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await stopServer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopServer();
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err);
  await stopServer();
  process.exit(1);
});

// Start server
try {
  const result = await startProxyServer();
  server = result.server;
  console.log('Proxy server started. Press Ctrl+C to stop.');
} catch (err) {
  console.error('Failed to start proxy server:', err);
  process.exit(1);
}
