import cors from 'cors';
import express from 'express';
import fs from 'fs-extra';
import path from 'upath';
import * as provider from './provider/index.js';
import { ProxyCheckerManager } from './proxy/proxy-checker-manager.js';
import { SQLiteProxy } from '../database/SQLiteProxy.js';
import { getSQLite, getSharedModels } from '../database/shared.js';

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

// ── Admin Model Management CRUD ────────────────────────────────────────────

/**
 * GET /admin/models — list all models (optional ?provider= filter)
 */
app.get('/admin/models', async (_req, res) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();

    const where = _req.query.provider ? { provider: _req.query.provider as string } : {};
    const dbModels = await modelsApi.find(where);

    const data = dbModels.map((model: any) => ({
      id: model.id,
      object: model.object,
      created: model.created,
      owned_by: model.owned_by,
      permission: model.permission,
      root: model.root,
      parent: model.parent,
      provider: model.provider,
      enabled: model.enabled !== 0
    }));

    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /admin/models — add a new model
 * Body: { id, provider, object?, created?, owned_by?, permission?, root?, parent?, enabled? }
 */
app.post('/admin/models', async (req, res) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();

    const { id, provider, object, created, owned_by, permission, root, parent, enabled } = req.body;

    if (!id || !provider) {
      res.status(400).json({ ok: false, message: 'id and provider are required' });
      return;
    }

    await modelsApi.insert({
      id,
      provider,
      object: object || 'model',
      created: created ?? Math.floor(Date.now() / 1000),
      owned_by: owned_by || provider,
      permission: permission ?? '[]',
      root: root || id,
      parent: parent ?? null,
      enabled: enabled !== undefined ? (enabled ? 1 : 0) : 1
    });

    res.json({ ok: true, message: 'Model added' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * PUT /admin/models — update an existing model
 * Body: { id, provider, ...fields }
 */
app.put('/admin/models', async (req, res) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();

    const { id, provider, ...updates } = req.body;

    if (!id || !provider) {
      res.status(400).json({ ok: false, message: 'id and provider are required' });
      return;
    }

    const data: any = { ...updates };
    if (data.enabled !== undefined) {
      data.enabled = data.enabled ? 1 : 0;
    }

    await modelsApi.update(data, { id, provider });

    res.json({ ok: true, message: 'Model updated' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * DELETE /admin/models — delete a model
 * Query: ?id=...&provider=...
 */
app.delete('/admin/models', async (req, res) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();

    const { id, provider } = req.query;

    if (!id || !provider) {
      res.status(400).json({ ok: false, message: 'id and provider are required' });
      return;
    }

    await modelsApi.delete({ id: id as string, provider: provider as string });

    res.json({ ok: true, message: 'Model deleted' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export { app };
