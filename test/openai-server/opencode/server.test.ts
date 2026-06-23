import { jest, describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios from 'axios';
import https from 'https';
import { Server } from 'net';
import { app } from '../../../src/openai-server/server.js';
import { getServerState } from '../../../src/utils/utils-server-state.cjs';
import { startServer, stopServer } from '../../../src/openai-server/utils.js';

type ServerState = NonNullable<Awaited<ReturnType<typeof getServerState>>>;

describe('OpenAI-compatible API', () => {
  let server: Server | undefined = undefined;
  let state: ServerState | null = null;
  const jestTimeout = 120000;

  beforeAll(async () => {
    state = await getServerState();
    if (!state) {
      ({ state, server } = await startServer(app));
    }

    if (!state) throw new Error('Server state not available');
    console.log('Server running at', state.url);
  }, jestTimeout);

  afterAll(async () => {
    if (server) await stopServer(server);
  }, jestTimeout);

  it(
    'returns a valid chat completion response',
    async () => {
      const res = await axios.post(
        `${state!.url}/v1/chat/completions`,
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
