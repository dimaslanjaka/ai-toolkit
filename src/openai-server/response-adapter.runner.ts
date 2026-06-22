#!/usr/bin/env node

/**
 * Test /v1/responses Endpoint
 *
 * Usage:
 *   PROVIDER=puter PORT=5758 node dist/openai-server/response-test.mjs
 *
 * Then test with:
 *   curl -X POST http://localhost:5758/v1/responses \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "model": "gpt-4o",
 *       "instructions": "You are a helpful assistant",
 *       "input": "What is 2+2?",
 *       "stream": false
 *     }'
 */

import axios from 'axios';
import https from 'https';
import { getServerState } from '../utils/utils-server-state.cjs';

async function main() {
  // Get server state
  const serverState = await getServerState();

  if (!serverState) {
    console.error('❌ Server not running. Start it with: PROVIDER=puter node dist/openai-server/start.mjs');
    process.exit(1);
  }

  const baseURL = serverState.url;
  console.log(`📡 Connecting to Responses server at ${baseURL}\n`);

  const client = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  });

  // Test non-streaming request
  console.log('📤 Sending non-streaming request...\n');

  try {
    const response = await client.post('/v1/responses', {
      model: 'gpt-4o',
      instructions: 'You are a helpful assistant',
      input: 'What is the capital of France?',
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
      '/v1/responses',
      {
        model: 'gpt-4o',
        instructions: 'You are a storyteller',
        input: 'Tell me a short joke',
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
            if (json.type === 'response.output_text.delta') {
              const content = json.delta;
              if (content) {
                process.stdout.write(content);
              }
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
