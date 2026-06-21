import axios from 'axios';
import https from 'https';
import { Server } from 'net';
import { app } from '../../../src/openai-server/server.js';
import { getServerState } from '../../../src/openai-server/utils-server-state.cjs';
import { findFreePort, startServer, stopServer } from '../../../src/openai-server/utils.js';

type ServerState = NonNullable<Awaited<ReturnType<typeof getServerState>>>;

describe('Weather tool call (streaming)', () => {
  let server: Server | undefined = undefined;
  let state: ServerState | null = null;
  const jestTimeout = 120000;

  beforeAll(async () => {
    state = await getServerState();
    if (!state) {
      ({ state, server } = await startServer(app, await findFreePort()));
    }

    if (!state) throw new Error('Server state not available');
    console.log('Server running at', state.url);
  }, jestTimeout);

  afterAll(async () => {
    if (server) await stopServer(server);
  }, jestTimeout);

  it(
    'streams tool_calls for get_weather with location parameter',
    async () => {
      if (!state) throw new Error('Server state not available');
      const res = await axios.post(
        `${state.url}/v1/chat/completions`,
        {
          model: 'deepseek-v4-flash-free',
          messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather for a location',
                parameters: {
                  type: 'object',
                  properties: { location: { type: 'string' } },
                  required: ['location']
                }
              }
            }
          ],
          stream: true
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          responseType: 'stream',
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      expect(res.status).toBe(200);

      let raw = '';
      let hasToolCall = false;

      await new Promise<void>((resolve) => {
        res.data.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.data.on('end', resolve);
      });

      // Parse SSE lines and look for tool_calls in any chunk
      const lines = raw.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]');
      expect(lines.length).toBeGreaterThan(0);

      for (const line of lines) {
        const payload = JSON.parse(line.slice(6));
        const delta = payload.choices?.[0]?.delta;
        if (delta?.tool_calls) {
          hasToolCall = true;
          // Verify the tool call structure
          expect(delta.tool_calls[0]).toHaveProperty('id');
          expect(delta.tool_calls[0]).toHaveProperty('function');
          expect(delta.tool_calls[0].function.name).toBe('get_weather');
          break;
        }
      }

      expect(hasToolCall).toBe(true);
    },
    jestTimeout
  );
});

describe('Complex multi-tool scenario', () => {
  it(
    'routes to the correct tool when multiple tools are defined',
    async () => {
      const state = await getServerState();
      if (!state) throw new Error('Server state not available');
      const res = await axios.post(
        `${state.url}/v1/chat/completions`,
        {
          model: 'deepseek-v4-flash-free',
          messages: [{ role: 'user', content: 'What time is it in London right now?' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather for a location',
                parameters: {
                  type: 'object',
                  properties: { location: { type: 'string' } },
                  required: ['location']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'get_time',
                description: 'Get current time for a timezone',
                parameters: {
                  type: 'object',
                  properties: { timezone: { type: 'string' } },
                  required: ['timezone']
                }
              }
            }
          ],
          tool_choice: 'auto',
          stream: true
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          responseType: 'stream',
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      expect(res.status).toBe(200);

      let raw = '';
      let toolCallName = '';
      let toolCallArgs = '';

      await new Promise<void>((resolve) => {
        res.data.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.data.on('end', resolve);
      });

      const lines = raw.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]');

      for (const line of lines) {
        const payload = JSON.parse(line.slice(6));
        const delta = payload.choices?.[0]?.delta;
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) toolCallName = tc.function.name;
            if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
          }
        }
      }

      // Should have picked get_time (not get_weather) for a time query
      expect(toolCallName).toBe('get_time');
      // Arguments should contain a timezone reference (London / Europe/London)
      expect(toolCallArgs.toLowerCase()).toMatch(/london|utc|europe/);
    },
    120000
  );

  it(
    'handles finish_reason=tool_calls in the final streaming chunk',
    async () => {
      const state = await getServerState();
      if (!state) throw new Error('Server state not available');
      const res = await axios.post(
        `${state.url}/v1/chat/completions`,
        {
          model: 'deepseek-v4-flash-free',
          messages: [{ role: 'user', content: 'Get me the forecast for Paris' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather for a location',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                    days: { type: 'number', description: 'Number of forecast days' }
                  },
                  required: ['location']
                }
              }
            }
          ],
          stream: true
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          responseType: 'stream',
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      expect(res.status).toBe(200);

      let raw = '';
      let lastFinishReason: string | null = null;

      await new Promise<void>((resolve) => {
        res.data.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.data.on('end', resolve);
      });

      const lines = raw.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]');

      for (const line of lines) {
        const payload = JSON.parse(line.slice(6));
        const finishReason = payload.choices?.[0]?.finish_reason;
        if (finishReason) lastFinishReason = finishReason;
      }

      // The last chunk with a finish_reason should say 'tool_calls', not 'stop'
      expect(lastFinishReason).toBe('tool_calls');
    },
    120000
  );
});
