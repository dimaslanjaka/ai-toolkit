#!/usr/bin/env node

/**
 * ChatGPT OpenAI-Compatible Server Demo
 *
 * Usage:
 *   PROVIDER=chatgpt node dist/openai-server/start.mjs
 *
 * Then test with:
 *   curl -X POST http://localhost:5758/v1/chat/completions \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "model": "gpt-4o",
 *       "messages": [{"role": "user", "content": "What is 2+2?"}],
 *       "stream": false
 *     }'
 */

import axios from 'axios';
import { getServerState } from './index.js';

async function main() {
  // Get server state
  const serverState = getServerState();

  if (!serverState) {
    console.error('❌ Server not running. Start it with: PROVIDER=chatgpt node dist/openai-server/start.mjs');
    process.exit(1);
  }

  const baseURL = serverState.url;
  console.log(`📡 Connecting to ChatGPT server at ${baseURL}\n`);

  const client = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'chatgpt' }
  });

  // Test non-streaming request
  console.log('📤 Sending non-streaming request...\n');

  try {
    const response = await client.post('/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      stream: false
    });

    console.log('✅ Response received:\n');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err: any) {
    console.error('❌ Error:', err.response?.data || err.message);
  }

  // Test streaming request
  console.log('\n📤 Sending streaming request...\n');

  try {
    const response = await client.post(
      '/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Tell me a short joke' }],
        stream: true
      },
      {
        responseType: 'stream'
      }
    );

    console.log('✅ Streaming response:\n');

    response.data.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              process.stdout.write(content);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    });

    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

    console.log('\n');
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  }
}

main().catch(console.error);
