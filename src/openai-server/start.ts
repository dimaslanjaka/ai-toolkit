import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'upath';
import { app } from './server.js';
import { serverLogger, startServer } from './utils.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const httpsEnabled = process.env.OPENAI_SERVER_HTTPS !== 'false';
const httpsKeyFile = path.resolve(process.env.OPENAI_SERVER_HTTPS_KEY_FILE || '.cert/dev.pem');
const httpsCertFile = path.resolve(process.env.OPENAI_SERVER_HTTPS_CERT_FILE || '.cert/cert.pem');

function getHttpsOptions() {
  if (!httpsEnabled) {
    return undefined;
  }

  const missingFiles = [httpsKeyFile, httpsCertFile].filter((file) => !fs.existsSync(file));

  if (missingFiles.length > 0) {
    throw new Error(
      `HTTPS is enabled but certificate files are missing: ${missingFiles.join(', ')}. Run "yarn dev:web" once to generate them with vite-plugin-mkcert, or set OPENAI_SERVER_HTTPS=false.`
    );
  }

  return {
    key: fs.readFileSync(httpsKeyFile),
    cert: fs.readFileSync(httpsCertFile)
  };
}

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

startServer(app, 5758, { https: getHttpsOptions() }).then(({ state }) => {
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
});
