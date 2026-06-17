/**
 * Test that a single log file contains both request prompt and response.
 * Starts server, sends one request, then checks the messages dir.
 */
import fs from 'fs-extra';
import { startServer, stopServer } from './utils.js';
import { app } from './server.js';

async function main() {
  // Clear + recreate messages dir
  const logDir = 'tmp/logs/openai-compatible/messages';
  fs.rmSync(logDir, { recursive: true, force: true });
  fs.mkdirSync(logDir, { recursive: true });

  // Start server
  const { state, server } = await startServer(app, 15758);
  console.log('Server running at', state.url);

  // Send a chat completion request via fetch
  const res = await fetch(`${state.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
    body: JSON.stringify({
      model: 'deepseek-v4-flash-free',
      messages: [{ role: 'user', content: 'Say hello in one word' }],
      stream: false
    })
  });

  const data = await res.json();
  console.log('Response:', JSON.stringify(data).substring(0, 120) + '...');

  // Check messages dir
  const files = fs.readdirSync(logDir);
  console.log('\nMessage files:', files);

  for (const file of files) {
    const content = fs.readFileSync(`${logDir}/${file}`, 'utf-8');
    console.log(`\n--- ${file} ---`);
    console.log(content.substring(0, 500));
  }

  await stopServer(server);
}

main().catch((err) => {
  console.error(err);
});
