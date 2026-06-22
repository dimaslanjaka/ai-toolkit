import axios from 'axios';
import https from 'https';
import { Server } from 'net';
import { app } from '../../../src/openai-server/server.js';
import { getServerState } from '../../../src/utils/utils-server-state.cjs';
import { findFreePort, startServer, stopServer } from '../../../src/openai-server/utils.js';

type ServerState = NonNullable<Awaited<ReturnType<typeof getServerState>>>;

describe('Tool calling', () => {
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
    'returns tool_calls when requested',
    async () => {
      const res = await axios.post(
        `${state!.url}/v1/chat/completions`,
        {
          model: 'deepseek-v4-flash-free',
          messages: [
            {
              role: 'user',
              content: 'Call a tool named get_time with no arguments'
            }
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_time',
                description: 'Get current time',
                parameters: { type: 'object', properties: {} }
              }
            }
          ],
          tool_choice: 'auto',
          stream: false
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      expect(res.status).toBe(200);
      expect(res.data.choices[0].message).toHaveProperty('tool_calls');
    },
    jestTimeout
  );
});
