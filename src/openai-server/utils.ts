import net from 'net';
import { writefile, readfile } from 'sbg-utility';
import path from 'upath';
import { PersistentLogger } from '../utils/logs.cjs';

const STATE_FILE = path.join(process.cwd(), 'tmp/data/openai-server.json');
const LOG_FILE = path.join(process.cwd(), 'tmp/logs/openai-compatible/server.log');
export const serverLogger = new PersistentLogger(LOG_FILE);

export interface ServerState {
  port: number;
  pid: number;
  startedAt: string;
  url: string;
}

/**
 * Find a free port starting from a preferred port
 */
export function findFreePort(startPort: number = 5758): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findFreePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * Save server state to a persistent file
 */
export function saveServerState(state: ServerState) {
  writefile(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Read server state from the persistent file
 */
export function getServerState(): ServerState | null {
  try {
    const content = readfile(STATE_FILE);
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Start the OpenAI-compatible server on a free port and save state
 */
export async function startServer(app: any, preferredPort: number = 5758) {
  const port = await findFreePort(preferredPort);

  return new Promise<ServerState>((resolve) => {
    app.listen(port, '0.0.0.0', () => {
      const state: ServerState = {
        port,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        url: `http://localhost:${port}`
      };

      saveServerState(state);

      serverLogger.log(`OpenAI-compatible server running on http://0.0.0.0:${port}`);
      serverLogger.log(`State saved to ${STATE_FILE}`);

      resolve(state);
    });
  });
}
