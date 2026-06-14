import { app } from './server.js';
import { startServer } from './utils.js';

// Global error handlers to prevent server crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - keep server running
});

startServer(app, 5758).then((state) => {
  console.log(`POST ${state.url}/v1/chat/completions to send chat requests`);
});
