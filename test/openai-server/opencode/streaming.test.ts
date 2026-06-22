import { jest, describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios from 'axios';
import https from 'https';
import { Server } from 'net';
import { app } from '../../../src/openai-server/server.js';
import { getServerState } from '../../../src/utils/utils-server-state.cjs';
import { findFreePort, startServer, stopServer } from '../../../src/openai-server/utils.js';

type ServerState = NonNullable<Awaited<ReturnType<typeof getServerState>>>;

describe('Streaming API', () => {
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
    'streams chunks',
    async () => {
      const res = await axios.post(
        `${state!.url}/v1/chat/completions`,
        {
          model: 'deepseek-v4-flash-free',
          messages: [{ role: 'user', content: 'count from 1 to 3' }],
          stream: true
        },
        {
          headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
          responseType: 'stream',
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );

      expect(res.status).toBe(200);

      let chunks = 0;
      let text = '';

      await new Promise<void>((resolve) => {
        res.data.on('data', (chunk: Buffer) => {
          chunks++;
          text += chunk.toString();
        });
        res.data.on('end', resolve);
      });

      expect(chunks).toBeGreaterThan(0);
      expect(text.length).toBeGreaterThan(0);
    },
    jestTimeout
  );
});
