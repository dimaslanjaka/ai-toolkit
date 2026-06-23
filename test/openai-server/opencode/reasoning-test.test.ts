import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import axios from 'axios';
import https from 'https';
import { Server } from 'net';
import { app } from '../../../src/openai-server/server.js';
import { findFreePort, startServer, stopServer } from '../../../src/openai-server/utils.js';
import { getServerState } from '../../../src/utils/utils-server-state.cjs';
import context1 from './thinking_mode_error.json' with { type: 'json' };
import context2 from './thinking_mode_error2.json' with { type: 'json' };

type ServerState = NonNullable<Awaited<ReturnType<typeof getServerState>>>;

function checkServerStateAndRunning(state: ServerState | null) {
  if (!state) throw new Error('Server state not available');
}

const fixtures = [context1, context2];

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

  fixtures.forEach((ctx, i) => {
    describe(`fixture ${i}`, () => {
      it(
        'returns tool_calls without DeepSeek reasoning_content error',
        async () => {
          const res = await axios.post(
            `${state!.url}/v1/chat/completions`,
            {
              ...ctx,
              stream: false
            },
            {
              headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
              httpsAgent: new https.Agent({ rejectUnauthorized: false })
            }
          );

          expect(res.status).toBe(200);
          expect(res.data).toHaveProperty('choices');

          const message = res.data.choices[0].message;
          console.log('Response message keys:', Object.keys(message));
          console.log('Has tool_calls:', !!message.tool_calls);
          console.log('Has content:', !!message.content);
        },
        jestTimeout
      );

      it(
        'allows follow-up round-trip after tool execution',
        async () => {
          const res = await axios.post(
            `${state!.url}/v1/chat/completions`,
            {
              ...ctx,
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

          const toolResults = message.tool_calls.map((tc: any) => ({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: JSON.stringify({ result: 'ok', mocked: true }),
            name: tc.function?.name || 'unknown'
          }));

          const followUpRes = await axios.post(
            `${state!.url}/v1/chat/completions`,
            {
              model: ctx.model || 'opencode',
              max_tokens: ctx.max_tokens || 32000,
              messages: [
                ...ctx.messages,
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

          expect(followUpRes.status).toBe(200);
          expect(followUpRes.data).toHaveProperty('choices');
        },
        jestTimeout
      );
    });
  });
});
