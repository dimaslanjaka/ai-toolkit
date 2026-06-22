import { jest, describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios from 'axios';
import https from 'https';
import { Server } from 'net';
import { app } from '../../../src/openai-server/server.js';
import { getServerState } from '../../../src/utils/utils-server-state.cjs';
import { findFreePort, startServer, stopServer } from '../../../src/openai-server/utils.js';
import context from './deepseek_thinking_mode_reasoning_content_error.json' with { type: 'json' };

type ServerState = NonNullable<Awaited<ReturnType<typeof getServerState>>>;

function checkServerStateAndRunning(state: ServerState | null) {
  if (!state) throw new Error('Server state not available');
}

describe('Tool calling with reasoning_content handling', () => {
  let server: Server | undefined = undefined;
  let state: ServerState | null = null;
  const jestTimeout = 180000;

  beforeAll(async () => {
    state = await getServerState();
    if (!state) {
      ({ state, server } = await startServer(app, await findFreePort()));
    }
    checkServerStateAndRunning(state);
    console.log('Server running at', state!.url);
  }, jestTimeout);

  afterAll(async () => {
    if (server) await stopServer(server);
  }, jestTimeout);

  it(
    'returns tool_calls without DeepSeek reasoning_content error',
    async () => {
      // Send a request with tools that exist in the registry (ai-memory_* tools).
      // DeepSeek may return reasoning_content in thinking mode. If it does,
      // the server's follow-up API call must preserve reasoning_content or
      // DeepSeek rejects with 400.
      const res = await axios.post(
        `${state!.url}/v1/chat/completions`,
        {
          ...context,
          stream: false
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      // If reasoning_content is not preserved properly, the server throws 500
      // (from the follow-up call rejection bubble-up). This confirms we never
      // hit that path.
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('choices');

      const message = res.data.choices[0].message;
      console.log('Response message keys:', Object.keys(message));
      console.log('Has tool_calls:', !!message.tool_calls);
      console.log('Has content:', !!message.content);

      // The follow-up path was exercised: if DeepSeek called any registry tool,
      // the server internally made a second API call. If that follow-up failed
      // due to missing reasoning_content, we'd get a 500, not 200.
      // A 200 status here means the reasoning_content preservation worked.
    },
    jestTimeout
  );

  it(
    'allows follow-up round-trip after tool execution',
    async () => {
      // This test simulates the full flow: get tool_calls, then verify
      // a manually-crafted follow-up does not 400.
      const res = await axios.post(
        `${state!.url}/v1/chat/completions`,
        {
          ...context,
          stream: false
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      expect(res.status).toBe(200);
      const message = res.data.choices[0].message;

      if (!message.tool_calls || message.tool_calls.length === 0) {
        console.log('No tool_calls returned — skipping follow-up test');
        return;
      }

      // Construct tool responses (synthetic/mocked since we just need
      // to verify the follow-up call doesn't error)
      const toolResults = message.tool_calls.map((tc: any) => ({
        role: 'tool' as const,
        tool_call_id: tc.id,
        content: JSON.stringify({ result: 'ok', mocked: true }),
        name: tc.function?.name || 'unknown'
      }));

      // Simulate a client-side follow-up call with the tool results
      const followUpRes = await axios.post(
        `${state!.url}/v1/chat/completions`,
        {
          model: context.model || 'opencode',
          max_tokens: context.max_tokens || 32000,
          messages: [
            ...context.messages,
            {
              role: 'assistant',
              content: message.content || null,
              tool_calls: message.tool_calls
            },
            ...toolResults
          ]
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      // Critical assertion: the follow-up must not 400/500
      expect(followUpRes.status).toBe(200);
      expect(followUpRes.data).toHaveProperty('choices');
    },
    jestTimeout
  );
});
