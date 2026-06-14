import { app } from './server.js';
import { startServer, serverLogger } from './utils.js';

// Global error handlers to prevent server crash
process.on('unhandledRejection', (reason, promise) => {
  serverLogger.logSync(`Unhandled Rejection at: ${promise} reason: ${reason}`);
  // Don't exit - keep server running
});

process.on('uncaughtException', (error) => {
  serverLogger.logSync(`Uncaught Exception: ${error}`);
  // Don't exit - keep server running
});

startServer(app, 5758).then((state) => {
  const message = `POST ${state.url}/v1/chat/completions to send chat requests`;
  console.log(message);
  serverLogger.log(message);
});
