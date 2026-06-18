/**
 * Debug /v1/completions and /v1/embeddings.
 * Starts server, sends requests, then prints response and message logs.
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
  const { state, server } = await startServer(app, 15759);
  console.log('Server running at', state.url);

  try {
    // Send a legacy completion request via fetch
    const completionRes = await fetch(`${state.url}/v1/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Provider': 'opencode'
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash-free',
        prompt: 'function add(a, b) {',
        max_tokens: 64,
        temperature: 0.2,
        stream: false
      })
    });

    const completionData = await completionRes.json();

    console.log('\n/v1/completions status:', completionRes.status);
    console.log('/v1/completions response:', completionData);

    // Send an embeddings request via fetch
    const embeddingRes = await fetch(`${state.url}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Provider': 'opencode'
      },
      body: JSON.stringify({
        model: 'local-embedding',
        input: 'hello world from embedding endpoint'
      })
    });

    const embeddingData = await embeddingRes.json();

    console.log('\n/v1/embeddings status:', embeddingRes.status);
    console.log('/v1/embeddings response:', {
      ...embeddingData,
      data: embeddingData.data?.map((item: any) => ({
        ...item,
        embedding: `[${item.embedding?.length ?? 0} numbers]`
      }))
    });

    // Check messages dir
    const files = fs.readdirSync(logDir);
    console.log('\nMessage files:', files);

    for (const file of files) {
      const content = fs.readFileSync(`${logDir}/${file}`, 'utf-8');
      console.log(`\n--- ${file} ---`);
      console.log(content.substring(0, 1000));
    }
  } finally {
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
});
