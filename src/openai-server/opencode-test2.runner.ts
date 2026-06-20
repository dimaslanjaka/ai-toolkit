/**
 * Test that a single log file contains both request prompt and response.
 * Starts server, sends one request, then checks the messages dir.
 */

import { loadDotenv } from 'binary-collections';
import fs from 'fs-extra';
import { getServerState } from './utils.js';

import { fetch, Agent } from 'undici';

loadDotenv();

async function main() {
  const logDir = 'tmp/logs/openai-compatible/messages';

  fs.rmSync(logDir, { recursive: true, force: true });
  fs.mkdirSync(logDir, { recursive: true });

  const state = getServerState();
  if (!state) throw new Error('Server state not available');

  console.log('Server running at', state.url);

  /**
   * TLS FIX for localhost HTTPS
   * - allows self-signed certs
   * - safe only for local dev
   */
  const dispatcher = state.url.startsWith('https')
    ? new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    : undefined;

  const res = await fetch(`${state.url}/v1/chat/completions`, {
    method: 'POST',
    dispatcher,
    headers: {
      'content-type': 'application/json',
      'x-request-provider': 'opencode'
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash-free',
      messages: [
        {
          role: 'user',
          content: 'Hello! Respond with a greeting and tell me what model you are.'
        }
      ],
      stream: false
    })
  });

  const data = await res.json();
  console.log('Response:', data);

  const files = fs.readdirSync(logDir);
  console.log('\nMessage files:', files);

  for (const file of files) {
    const content = fs.readFileSync(`${logDir}/${file}`, 'utf-8');
    console.log(`\n--- ${file} ---`);
    console.log(content.substring(0, 500));
  }
}

main().catch((err) => {
  console.error(err);
});
