import https from 'https';
import moment from 'moment';
import net from 'net';
import path from 'upath';
import { PersistentLogger } from '../utils/logs.cjs';
import { saveServerState, ServerState } from '../utils/utils-server-state.cjs';

const STATE_FILE = path.join(process.cwd(), 'tmp/database/openai-server.json');
const LOG_FILE = path.join(process.cwd(), 'tmp/logs/openai-compatible/server.log');
export const serverLogger = new PersistentLogger(LOG_FILE);

/**
 * Log a message to a timestamp-based file inside tmp/logs/openai-compatible/messages/
 * and print its file path to the main serverLogger and console.
 *
 * @param prefix A prefix to describe the message (e.g., 'PUTER REQUEST PROMPT')
 * @param content The actual content to log
 * @returns The absolute file path of the created log file, for use with appendMessageToFile
 */
export function logMessageToFile(prefix: string, content: string): string {
  const timestamp = moment().format('DD-MM-YYYY-HH-mm-ss');
  const filename = `${prefix.replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase()}_${timestamp}.log`;
  const filePath = path.join(process.cwd(), 'tmp/logs/openai-compatible/messages', filename);

  const messageLogger = new PersistentLogger(filePath);
  messageLogger.logSync(`\n--- ${prefix} ---\n${content}\n----------------${'-'.repeat(prefix.length)}\n`);

  // Write the file path to the main server log and console
  const infoMsg = `Logged ${prefix} to: ${filePath}`;
  serverLogger.log(infoMsg);
  console.log(infoMsg);

  return filePath;
}

/**
 * Append a message to an existing log file created by logMessageToFile.
 * Useful for writing related content (e.g., prompt + response) to a single file.
 *
 * @param filePath The absolute path to the existing log file
 * @param prefix A section label (e.g., 'PUTER RESPONSE')
 * @param content The content to append
 */
export function appendMessageToFile(filePath: string, prefix: string, content: string): void {
  const messageLogger = new PersistentLogger(filePath);
  messageLogger.logSync(`\n--- ${prefix} ---\n${content}\n----------------${'-'.repeat(prefix.length)}\n`);

  const infoMsg = `Appended ${prefix} to: ${filePath}`;
  serverLogger.log(infoMsg);
  console.log(infoMsg);
}

export interface StartServerOptions {
  hostname?: string;
  https?: https.ServerOptions;
}

/**
 * Find a free port starting from a preferred port
 * @param startPort The port to start searching from (default: 5758)
 * @param maxAttempts Maximum number of ports to try (default: 100)
 */
export function findFreePort(startPort: number = 5758, maxAttempts: number = 100): Promise<number> {
  return new Promise((resolve, reject) => {
    const attemptPort = (port: number, attemptsLeft: number): void => {
      if (attemptsLeft <= 0) {
        reject(new Error(`Could not find a free port after ${maxAttempts} attempts starting from port ${startPort}`));
        return;
      }

      const server = net.createServer();
      server.unref();
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          if (port === startPort) {
            serverLogger.log(`Port ${startPort} is in use, searching for free port...`);
          }
          attemptPort(port + 1, attemptsLeft - 1);
        } else {
          reject(err);
        }
      });
      server.listen(port, () => {
        const { port: foundPort } = server.address() as net.AddressInfo;
        server.close(() => {
          if (foundPort !== startPort) {
            serverLogger.log(`Preferred port ${startPort} was in use, using port ${foundPort} instead`);
          }
          resolve(foundPort);
        });
      });
    };

    attemptPort(startPort, maxAttempts);
  });
}

/**
 * Start the OpenAI-compatible server on a free port and save state
 */
export async function startServer(
  app: import('express').Express,
  preferredPort: number | undefined = 5758,
  options: StartServerOptions = {}
): Promise<{ state: ServerState; server: net.Server }> {
  // Reset log on startup
  serverLogger.reset();

  const port = await findFreePort(preferredPort);
  const hostname = options.hostname || '0.0.0.0';
  const protocol = options.https ? 'https' : 'http';

  return new Promise<{ state: ServerState; server: net.Server }>((resolve) => {
    let server: net.Server;
    const handleListening = () => {
      const state: ServerState = {
        port,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        url: `${protocol}://localhost:${port}`,
        server: server // Add the server instance to the state
      };

      saveServerState(state);

      serverLogger.log(`OpenAI-compatible server running on ${protocol}://${hostname}:${port}`);
      serverLogger.log(`State saved to ${STATE_FILE}`);
      serverLogger.log(`Provider: ${process.env.PROVIDER || 'puter'}`);

      resolve({ state, server });

      // Setup cleanup on server close
      server.on('close', () => {
        serverLogger.log('Server shutting down');
      });
    };

    if (options.https) {
      server = https.createServer(options.https, app);
      server.listen(port, hostname, handleListening);
    } else {
      server = app.listen(port, hostname, handleListening);
    }
  });
}

/**
 * Stop the OpenAI-compatible server gracefully
 */
export async function stopServer(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) {
        serverLogger.log(`Error stopping server: ${err.message}`);
        reject(err);
        return;
      }
      serverLogger.log('Server stopped gracefully');
      resolve();
    });
  });
}
