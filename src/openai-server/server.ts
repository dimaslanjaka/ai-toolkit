import express from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import * as provider from './provider/index.js';
import { serverLogger } from './utils.js';

const app = express();

// Basic request logging (before body parsing)
app.use((req, res, next) => {
  serverLogger.log(`${req.method} ${req.path}`);
  serverLogger.log(JSON.stringify({ headers: req.headers }));
  next();
});

// Clear messages log folder on server restart
app.use((req, res, next) => {
  if (req.path === '/v1/chat/completions' || req.path === '/v1/responses') {
    const logDir = 'tmp/logs/openai-compatible/messages';
    fs.rmSync(logDir, { recursive: true, force: true });
    fs.mkdirSync(logDir, { recursive: true });
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Body logging middleware (after JSON parsing)
app.use((req, res, next) => {
  if (req.body && Object.keys(req.body).length > 0) {
    serverLogger.log(JSON.stringify({ body: req.body }));
  }
  next();
});

// Optional API‑key authorization middleware (accept any bearer token)
app.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    // Store the key on the request object for later use (if needed)
    (req as any).apiKey = auth.substring('Bearer '.length);
  }
  // No validation – any key is accepted; absence is also allowed
  next();
});

/**
 * OpenAI‑compatible Models List endpoint.
 */
app.get('/v1/models', provider.handleModels);

/**
 * OpenAI‑compatible Chat Completion endpoint.
 */
app.post('/v1/chat/completions', provider.handleChatCompletion);

/**
 * OpenAI‑compatible Responses endpoint.
 */
app.post('/v1/responses', provider.handleResponses);

export { app };
