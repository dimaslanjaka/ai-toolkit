import cors from 'cors';
import express, { Request, Response } from 'express';
import fs from 'fs-extra';
import crypto from 'node:crypto';
import path from 'upath';
import { SQLiteProxy } from '../database/SQLiteProxy.js';
import { getSQLite, getSettings, getSharedModels } from '../database/shared.js';
import * as provider from './provider/index.js';
import { ProxyCheckerManager } from '../proxy/proxy-checker-manager.js';
import { toolRegistry, registerTool, type ToolDefinition } from './tools/tool-registry.js';
import './tools/index.js'; // Auto-register built-in tools

import { appendMessageToFile, logMessageToFile, serverLogger } from './utils.js';
import { DEFAULT_PROVIDER, DEFAULT_PROVIDERS, DEFAULT_ORDER_PROVIDERS } from './constant.js';

const proxyChecker = new ProxyCheckerManager();
const app = express();

// Per-request logging middleware - captures raw HTTP request and response
app.use((req, res, next) => {
  // Skip logging for high-traffic endpoints
  const excludePaths = ['/proxy-checker/', '/admin/', '/api/'];
  if (excludePaths.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  // Generate unique request ID
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  // Capture raw request body
  let rawBody = '';
  req.on('data', (chunk) => {
    rawBody += chunk.toString('utf8');
  });

  req.on('end', () => {
    // Store raw body on request for later use
    (req as any).rawBody = rawBody;
  });

  // Capture response
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const originalJson = res.json.bind(res);
  let responseBody = '';
  let responseHeadersSent = false;

  // Track if this is a streaming response
  const isStreaming =
    (req.path === '/v1/chat/completions' || req.path === '/v1/responses' || req.path === '/v1/completions') &&
    req.body?.stream === true;

  // Override res.write to capture streaming response chunks
  res.write = ((chunk: any, encoding?: any, callback?: any) => {
    if (!responseHeadersSent) {
      responseHeadersSent = true;
    }
    if (chunk) {
      responseBody += chunk.toString('utf8');
    }
    return originalWrite(chunk, encoding, callback);
  }) as typeof res.write;

  // Override res.json to capture JSON response
  res.json = ((body: any) => {
    responseBody = JSON.stringify(body, null, 2);
    return originalJson(body);
  }) as typeof res.json;

  // Override res.end to finalize logging
  res.end = ((chunk?: any, encoding?: any, callback?: any) => {
    if (chunk) {
      responseBody += chunk.toString('utf8');
    }

    // Create log entry after response is complete
    setImmediate(() => {
      try {
        // Format request log
        const requestLog = formatRequestLog(req, requestId, startTime, rawBody);

        // Create log file with request
        const logFile = logMessageToFile(`REQUEST ${requestId}`, requestLog);

        // Append response
        if (responseBody) {
          const responseLog = formatResponseLog(res, responseBody, Date.now() - startTime);
          appendMessageToFile(logFile, `RESPONSE ${requestId}`, responseLog);
        } else if (isStreaming) {
          appendMessageToFile(logFile, `RESPONSE ${requestId}`, '[Streaming response - see server logs for chunks]');
        }
      } catch (logErr) {
        serverLogger.logSync(`Failed to log request/response: ${logErr}`);
      }
    });

    return originalEnd(chunk, encoding, callback);
  }) as typeof res.end;

  next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Helper function to format request log
function formatRequestLog(req: Request, requestId: string, startTime: number, rawBody: string): string {
  const lines: string[] = [];

  // Request line
  const url = (req as any).originalUrl || req.url;
  lines.push(`${req.method} ${url}`);

  // Headers (filter out sensitive ones)
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  for (const [key, value] of Object.entries(req.headers)) {
    if (!sensitiveHeaders.includes(key.toLowerCase()) && value !== undefined) {
      lines.push(`${key.toLowerCase()}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
  }

  // Empty line before body
  lines.push('');

  // Request body
  if (rawBody) {
    try {
      // Try to pretty-print JSON body
      const parsed = JSON.parse(rawBody);
      lines.push(JSON.stringify(parsed, null, 2));
    } catch {
      // Not JSON, log as-is
      lines.push(rawBody);
    }
  }

  return lines.join('\n');
}

// Helper function to format response log
function formatResponseLog(res: Response, responseBody: string, durationMs: number): string {
  const lines: string[] = [];

  // Status line
  const statusCode = (res as any).statusCode || 200;
  const statusMessage = (res as any).statusMessage || '';
  lines.push(`HTTP/1.1 ${statusCode} ${statusMessage}`.trim());

  // Response headers
  const headerKeys = (res as any).getHeaders ? (res as any).getHeaders() : {};
  for (const [key, value] of Object.entries(headerKeys)) {
    if (value !== undefined) {
      lines.push(`${key.toLowerCase()}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
  }

  // Empty line before body
  lines.push('');

  // Response body
  lines.push(responseBody);
  lines.push('');
  lines.push(`[Duration: ${durationMs}ms]`);

  return lines.join('\n');
}

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
 * List all active proxies for a given host, including all hosts each proxy works for.
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

    const proxies = await proxyDb.getProxiesByHostWithAllHosts(host);

    res.json({ ok: true, proxies });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// ── Model Management API (unified under /api/models) ──────────────────────────

/**
 * GET /api/models — list all models (optional ?provider= filter)
 */
app.get('/api/models', async (req: Request, res: Response) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();

    const where = req.query.provider ? { provider: req.query.provider as string } : {};
    const dbModels = await modelsApi.find(where);

    res.json({
      models: dbModels.map((model: any) => ({
        id: model.id,
        object: model.object,
        created: model.created,
        owned_by: model.owned_by,
        permission: model.permission,
        root: model.root,
        parent: model.parent,
        provider: model.provider,
        enabled: model.enabled !== 0
      }))
    });
  } catch (error) {
    serverLogger.logSync(`Models GET error: ${error}`);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * GET /api/models/:provider/:id — get model by provider and id
 */
app.get('/api/models/:provider/:id', async (req: Request, res: Response) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();
    const { provider, id } = req.params;

    const dbModel = await modelsApi.findOne({ id, provider });
    if (!dbModel) {
      return res.status(404).json({ error: `Model not found: ${id}` });
    }

    res.json({
      id: dbModel.id,
      object: dbModel.object,
      created: dbModel.created,
      owned_by: dbModel.owned_by,
      permission: dbModel.permission,
      root: dbModel.root,
      parent: dbModel.parent,
      provider: dbModel.provider,
      enabled: dbModel.enabled !== 0
    });
  } catch (error) {
    serverLogger.logSync(`Model GET error: ${error}`);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * POST /api/models/:provider/:id — create or update model
 * Body: { object?, owned_by?, permission?, root?, parent?, enabled? }
 */
app.post('/api/models/:provider/:id', async (req: Request, res: Response) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();
    const { provider, id } = req.params;
    const { object, owned_by, permission, root, parent, enabled } = req.body;

    const existing = await modelsApi.findOne({ id, provider });
    if (existing) {
      const updates: any = {};
      if (object !== undefined) updates.object = object;
      if (owned_by !== undefined) updates.owned_by = owned_by;
      if (permission !== undefined) updates.permission = permission;
      if (root !== undefined) updates.root = root;
      if (parent !== undefined) updates.parent = parent;
      if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;
      await modelsApi.update(updates, { id, provider });
      res.json({ success: true, id, provider, action: 'updated' });
    } else {
      await modelsApi.insert({
        id,
        provider,
        object: object || 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: owned_by || provider,
        permission: permission ?? '[]',
        root: root || id,
        parent: parent ?? null,
        enabled: enabled !== false ? 1 : 0
      });
      res.json({ success: true, id, provider, action: 'created' });
    }
  } catch (error) {
    serverLogger.logSync(`Model POST error: ${error}`);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * POST /api/models/:provider/:id/toggle — toggle enabled state
 * Body: { enabled?: boolean } — if omitted, toggles current state
 */
app.post('/api/models/:provider/:id/toggle', async (req: Request, res: Response) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();
    const { provider, id } = req.params;

    const existing = await modelsApi.findOne({ id, provider });
    if (!existing) {
      return res.status(404).json({ error: `Model not found: ${id}` });
    }

    const currentEnabled = existing.enabled !== 0;
    const newEnabled = req.body.enabled !== undefined ? !!req.body.enabled : !currentEnabled;
    await modelsApi.update({ enabled: newEnabled ? 1 : 0 }, { id, provider });
    res.json({ success: true, id, provider, enabled: newEnabled });
  } catch (error) {
    serverLogger.logSync(`Model toggle error: ${error}`);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * DELETE /api/models/:provider/:id — delete model
 */
app.delete('/api/models/:provider/:id', async (req: Request, res: Response) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();
    const modelsApi = await modelDb.models();
    await modelsApi.delete({ id: req.params.id, provider: req.params.provider });
    res.json({ success: true, id: req.params.id, provider: req.params.provider });
  } catch (error) {
    serverLogger.logSync(`Model DELETE error: ${error}`);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

// ── Tool Registry Management ───────────────────────────────────────────────

/**
 * GET /admin/tools — list all registered tools
 */
app.get('/admin/tools', (_req, res) => {
  try {
    const tools = toolRegistry.list();
    res.json({
      ok: true,
      count: tools.length,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /admin/tools — register a custom tool
 * Body: { name, description, parameters, handler }
 * Note: handler should be a string that will be eval'd (use with caution in production)
 */
app.post('/admin/tools', (req, res) => {
  try {
    const { name, description, parameters, handler } = req.body;

    if (!name || !description || !parameters || !handler) {
      res.status(400).json({
        ok: false,
        message: 'name, description, parameters, and handler are required'
      });
      return;
    }

    // Create a handler function from string (for dynamic tool registration)
    // SECURITY NOTE: In production, consider using a sandbox or validation
    let handlerFn: (args: Record<string, any>) => Promise<any>;
    try {
      handlerFn = eval(handler);
      if (typeof handlerFn !== 'function') {
        throw new Error('Handler must be a function');
      }
    } catch (err) {
      res.status(400).json({
        ok: false,
        message: `Invalid handler: ${err instanceof Error ? err.message : 'Could not parse handler function'}`
      });
      return;
    }

    const tool: ToolDefinition = {
      name,
      description,
      parameters,
      handler: handlerFn
    };

    registerTool(tool);

    res.json({
      ok: true,
      message: `Tool "${name}" registered successfully`,
      tool: {
        name,
        description,
        parameters
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * DELETE /admin/tools — unregister a tool
 * Query: ?name=...
 */
app.delete('/admin/tools', (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      res.status(400).json({ ok: false, message: 'name query parameter is required' });
      return;
    }

    const removed = toolRegistry.unregister(name as string);

    if (removed) {
      res.json({ ok: true, message: `Tool "${name}" unregistered` });
    } else {
      res.status(404).json({ ok: false, message: `Tool "${name}" not found` });
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /admin/tools/execute — manually execute a tool
 * Body: { name, arguments }
 */
app.post('/admin/tools/execute', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    if (!name) {
      res.status(400).json({ ok: false, message: 'name is required' });
      return;
    }

    const tool = toolRegistry.get(name);
    if (!tool) {
      res.status(404).json({ ok: false, message: `Tool "${name}" not found` });
      return;
    }

    const result = await tool.handler(args || {});
    res.json({ ok: true, name, result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// ── Settings API ───────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS: Record<string, string> = {
  RTK_ENABLED: 'false',
  DEFAULT_PROVIDER,
  FALLBACK_ORDER: JSON.stringify(DEFAULT_ORDER_PROVIDERS)
};

/**
 * GET /api/settings/:key — retrieve a setting by key (returns default if not set)
 */
app.get('/api/settings/:key', async (req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    if (!settings) {
      return res.status(503).json({ error: 'Settings service unavailable' });
    }
    const key = req.params.key as string;
    let value = await settings.getSetting(key);

    // Return default if not set
    if (value === null || value === undefined) {
      value = SETTINGS_DEFAULTS[key];
      if (value === undefined) {
        return res.status(404).json({ error: `Setting not found: ${key}` });
      }
    }

    res.json({ key, value });
  } catch (error) {
    serverLogger.logSync(`Settings GET error: ${error}`);
    // Ensure we always return JSON, not HTML
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/settings/:key — write a setting
 * Body: { value }
 */
app.post('/api/settings/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    const { value } = req.body;
    if (!key || typeof key !== 'string' || value === undefined) {
      return res.status(400).json({ error: 'key and value must be provided' });
    }
    const settings = await getSettings();
    if (!settings) {
      return res.status(503).json({ error: 'Settings service unavailable' });
    }
    // Store value as string
    const storeValue = String(value);
    await settings.setSetting(key, storeValue);

    res.json({ success: true, key, value: storeValue });
  } catch (error) {
    serverLogger.logSync(`Settings POST error: ${error}`);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ── Provider Management API ───────────────────────────────────────────────────

/**
 * GET /api/providers — list all providers with enabled status
 */
app.get('/api/providers', async (req: Request, res: Response) => {
  try {
    const modelDb = await getSharedModels();
    await modelDb.initialize();

    const providers = DEFAULT_PROVIDERS;
    const result = await Promise.all(
      providers.map(async (provider) => {
        try {
          const rows = await modelDb.query<{ provider: string; enabled: number }>(
            'SELECT enabled FROM providers WHERE provider = ?',
            [provider]
          );
          const enabled = rows.length > 0 ? rows[0].enabled === 1 : true;
          return { provider, enabled };
        } catch {
          return { provider, enabled: true };
        }
      })
    );

    res.json({ providers: result });
  } catch (error) {
    serverLogger.logSync(`Providers GET error: ${error}`);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/providers/:provider/toggle — enable/disable a provider
 * Body: { enabled: boolean }
 */
app.post('/api/providers/:provider/toggle', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider;
    const { enabled } = req.body;

    if (!provider || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'provider and enabled (boolean) must be provided' });
    }

    const modelDb = await getSharedModels();
    await modelDb.initialize();

    const enabledInt = enabled ? 1 : 0;

    // Insert or update provider in providers table
    try {
      await modelDb.execute(
        `INSERT OR REPLACE INTO providers (provider, enabled, priority, config)
         VALUES (?, ?, 0, NULL)`,
        [provider, enabledInt]
      );
    } catch (err) {
      serverLogger.logSync(`Error toggling provider ${provider}: ${err}`);
      return res.status(500).json({
        error: 'Failed to update provider',
        details: (err as any)?.message || String(err)
      });
    }

    res.json({ success: true, provider, enabled });
  } catch (error) {
    serverLogger.logSync(`Provider toggle error: ${error}`);
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export { app };
