import { app } from './server.js';
import { startServer, serverLogger } from './utils.js';
import fs from 'fs-extra';

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
  const message = `POST ${state.url}/v1/chat/completions to send chat requests`;
  console.log(message);
  serverLogger.log(message);
});
