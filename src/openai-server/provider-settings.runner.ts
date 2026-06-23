/**
 * Test provider chain settings API (DEFAULT_PROVIDER, FALLBACK_ORDER).
 * Run with: node --no-warnings=ExperimentalWarning --loader ts-node/esm src/openai-server/provider-settings.runner.ts
 */

import { loadDotenv } from 'binary-collections';
import fs from 'fs-extra';
import path from 'upath';
import { Server } from 'node:net';
import { Agent, fetch } from 'undici';
import { app } from './server.js';
import { startServer, stopServer } from './utils.js';

loadDotenv();

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

async function main() {
  let server: Server | undefined = undefined;
  let state: { url: string } | undefined;

  console.log('Starting server...');
  ({ state, server } = await startServer(app, undefined, { https: getHttpsOptions() }));
  if (!state) throw new Error('Server not available');

  const baseUrl = state.url;
  console.log('Server running at', baseUrl);

  // Give server time to fully initialize
  await new Promise((resolve) => setTimeout(resolve, 500));

  /**
   * TLS FIX for localhost HTTPS
   */
  const dispatcher = baseUrl.startsWith('https') ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

  // Test 1: Read non-existent settings (should 404)
  console.log('\n--- Test 1: Read DEFAULT_PROVIDER (expect 404) ---');
  const res1 = await fetch(`${baseUrl}/api/settings/DEFAULT_PROVIDER`, { dispatcher });
  console.log(`Status: ${res1.status}`);
  console.log('Body:', await res1.json());

  // Test 2: Write DEFAULT_PROVIDER
  console.log('\n--- Test 2: Write DEFAULT_PROVIDER ---');
  const res2 = await fetch(`${baseUrl}/api/settings/DEFAULT_PROVIDER`, {
    method: 'POST',
    dispatcher,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'chatgpt' })
  });
  console.log(`Status: ${res2.status}`);
  console.log('Body:', await res2.json());

  // Test 3: Write FALLBACK_ORDER
  console.log('\n--- Test 3: Write FALLBACK_ORDER ---');
  const res3 = await fetch(`${baseUrl}/api/settings/FALLBACK_ORDER`, {
    method: 'POST',
    dispatcher,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: JSON.stringify(['puter', 'chatgpt', 'opencode']) })
  });
  console.log(`Status: ${res3.status}`);
  console.log('Body:', await res3.json());

  // Test 4: Read DEFAULT_PROVIDER (should 200)
  console.log('\n--- Test 4: Read DEFAULT_PROVIDER (expect 200) ---');
  const res4 = await fetch(`${baseUrl}/api/settings/DEFAULT_PROVIDER`, { dispatcher });
  console.log(`Status: ${res4.status}`);
  console.log('Body:', await res4.json());

  // Test 5: Read FALLBACK_ORDER
  console.log('\n--- Test 5: Read FALLBACK_ORDER ---');
  const res5 = await fetch(`${baseUrl}/api/settings/FALLBACK_ORDER`, { dispatcher });
  console.log(`Status: ${res5.status}`);
  console.log('Body:', await res5.json());

  if (server) await stopServer(server);
  console.log('\n--- All tests complete ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
