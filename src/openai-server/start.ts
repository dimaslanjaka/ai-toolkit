import { app } from './server.js';
import { startServer } from './utils.js';

startServer(app, 5758).then((state) => {
  console.log(`POST ${state.url}/v1/chat/completions to send chat requests`);
});
