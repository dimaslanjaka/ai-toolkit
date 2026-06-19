import fs from 'fs-extra';
import { app } from './server.js';
import { serverLogger, startServer } from './utils.js';
import { startProxyChecker } from './proxy/start-proxy-checker.js';

// Clear messages log folder on server startup
const logDir = 'tmp/logs/openai-compatible/messages';
fs.rmSync(logDir, { recursive: true, force: true });
fs.mkdirSync(logDir, { recursive: true });

// Global error handlers to prevent server crash
process.on('unhandledRejection', (reason, promise) => {
  serverLogger.logSync(`Unhandled Rejection at: ${promise} reason: ${reason}`);
  // Don't exit - keep server running
});

process.on('uncaughtException', (error) => {
  serverLogger.logSync(`Uncaught Exception: ${error}`);
  // Don't exit - keep server running
});

// Express error handling middleware (must be last)
app.use((err: any, _req: any, res: any, _next: any) => {
  serverLogger.logSync(`Request error: ${err?.message || err}`);
  if (!res.headersSent) {
    res.status(400).json({ error: { message: err?.message || 'Bad request', type: 'invalid_request_error' } });
  }
});

startServer(app, 5758).then(({ state }) => {
  const endpoints = [
    ['GET', '/chat/'],
    ['GET', '/v1/models'],
    ['POST', '/v1/chat/completions'],
    ['POST', '/v1/responses'],
    ['POST', '/v1/completions'],
    ['POST', '/v1/embeddings'],
    ['ALL', '/proxy-checker/start'],
    ['ALL', '/proxy-checker/stop'],
    ['GET', '/proxy-checker/status'],
    ['GET', '/proxy-checker/logs']
  ];
  const message = [
    'Available endpoints:',
    ...endpoints.map(([method, route]) => `  ${method} ${state.url}${route}`)
  ].join('\n');

  console.log(message);
  serverLogger.log(message);
  console.log('starting proxy checker...');
  // startProxyChecker([], true); // for debug
  startProxyChecker();
});
