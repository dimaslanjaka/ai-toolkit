import axios from 'axios';
import https from 'https';
import { Server } from 'net';
import { app } from '../../../src/openai-server/server.js';
import { checkServerPort, getServerState } from '../../../src/openai-server/utils-server-state.cjs';
import { findFreePort, startServer, stopServer } from '../../../src/openai-server/utils.js';

describe('OpenAI-compatible API', () => {
  let server: Server | undefined = undefined;
  let state = getServerState()!;
  const jestTimeout = 120000;

  beforeAll(async () => {
    if (!state || (state && !(await checkServerPort({ port: state.port })))) {
      ({ state, server } = await startServer(app, await findFreePort()));
    }

    console.log('Server running at', state.url);
  }, jestTimeout);

  afterAll(async () => {
    if (server) await stopServer(server);
  }, jestTimeout);

  it(
    'returns a valid chat completion response',
    async () => {
      const res = await axios.post(
        `${state.url}/v1/chat/completions`,
        {
          model: 'deepseek-v4-flash-free',
          messages: [{ role: 'user', content: 'Say hello in one word' }],
          stream: false
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Provider': 'opencode'
          },
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('choices');
      expect(res.data.choices[0]).toHaveProperty('message');
      expect(typeof res.data.choices[0].message.content).toBe('string');
    },
    jestTimeout
  );
});
