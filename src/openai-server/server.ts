import cors from 'cors';
import express from 'express';
import fs from 'fs-extra';
import path from 'upath';
import * as provider from './provider/index.js';
import { ProxyCheckerManager } from './proxy/proxy-checker-manager.js';
import { SQLiteProxy } from '../database/SQLiteProxy.js';
import { getSQLite } from '../database/shared.js';

import { serverLogger } from './utils.js';

const proxyChecker = new ProxyCheckerManager();
const app = express();

// Basic request logging (before body parsing)
app.use((req, res, next) => {
  serverLogger.log(`${req.method} ${req.path}`);
  serverLogger.log(JSON.stringify({ headers: req.headers }));
  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const chatFrontendDirectory = path.join(process.cwd(), 'dist/openai-server/frontend');
const chatFrontendIndex = path.join(chatFrontendDirectory, 'index.html');

// Serve the frontend at root and all sub-routes
app.use(express.static(chatFrontendDirectory));
app.get(/^\/(?:chat(?:\/.*)?)?$/, (_req, res, next) => {
  if (!fs.existsSync(chatFrontendIndex)) {
    next();
    return;
  }

  res.sendFile(chatFrontendIndex);
});

// Optional API‑key authorization middleware (accept any bearer token)
app.use((req, _res, next) => {
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

/**
 * OpenAI-compatible Legacy Completion endpoint.
 * Usually used by autocomplete / inline suggestions.
 */
app.post('/v1/completions', provider.handleCompletion);

/**
 * OpenAI-compatible Embeddings endpoint.
 * Usually used by semantic search / codebase indexing.
 */
app.post('/v1/embeddings', provider.handleEmbeddings);

app.all('/proxy-checker/start', async (_req, res) => {
  try {
    const result = await proxyChecker.start();

    res.status(result.ok ? 202 : 409).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.all('/proxy-checker/stop', async (_req, res) => {
  try {
    const result = await proxyChecker.stop();

    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/proxy-checker/status', async (_req, res) => {
  res.json({
    ok: true,
    status: await proxyChecker.getStatus()
  });
});

app.get('/proxy-checker/logs', async (req, res) => {
  const limit = Number(req.query.limit ?? 200);

  const logs = await proxyChecker.getLogs(Number.isFinite(limit) ? limit : 200);

  res.json({
    ok: true,
    status: await proxyChecker.getStatus(),
    logs
  });
});

/**
 * List all active proxies for a given host.
 * Query params: host (required)
 */
app.get('/proxy-checker/proxies', async (req, res) => {
  try {
    const host = req.query.host as string | undefined;
    if (!host) {
      res.status(400).json({ ok: false, message: 'Missing required query parameter: host' });
      return;
    }

    const db = await getSQLite();
    const proxyDb = new SQLiteProxy(db);

    const proxies = await proxyDb.getProxiesByHost(host);

    res.json({ ok: true, proxies });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export { app };
