import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import { URL } from 'url';
import { argv } from 'process';
import minimist from 'minimist';
import { SocksClient } from 'socks';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getWorkingProxies } from './proxies-data.js';
import type { Proxy as ProxyRecord } from '../database/ProxyDB.js';

/* ═══════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════ */

interface ProxyAuth {
  username: string;
  password: string;
}

interface ProxyConfig {
  id: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  host: string;
  port: number;
  auth?: ProxyAuth;
}

const { timeout = 10 } = minimist(argv.slice(2), {
  string: ['timeout'],
  default: { timeout: '10' }
});
const LISTEN_PORT = 8080;
const TIMEOUT_MS = Number(timeout) * 1000; // per-upstream attempt, default 10s
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MiB

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */

/** Convert a DB Proxy record into local ProxyConfig. */
function parseDbProxy(record: ProxyRecord): ProxyConfig | null {
  let raw = record.proxy;
  if (!raw) return null;

  // Normalize: add protocol prefix if missing
  const hasProtocol = raw.includes('://');
  const dbType = (record.type || 'http').toLowerCase();
  const typeMap: Record<string, 'http' | 'https' | 'socks4' | 'socks5'> = {
    http: 'http',
    https: 'https',
    socks4: 'socks4',
    socks5: 'socks5',
    socks: 'socks5'
  };
  const proxyType = typeMap[dbType] || 'http';

  if (!hasProtocol) {
    raw = `${proxyType}://${raw}`;
  }

  try {
    const url = new URL(raw);
    const auth: ProxyAuth | undefined =
      url.username || record.username
        ? {
            username: url.username || record.username || '',
            password: url.password || record.password || ''
          }
        : undefined;

    return {
      id: record.proxy,
      type: proxyType,
      host: url.hostname,
      port: parseInt(url.port, 10) || (proxyType === 'https' ? 443 : 80),
      auth
    };
  } catch {
    return null;
  }
}

/** Buffer the client request so we can retry with another upstream. */
function bufferRequest(req: http.IncomingMessage, maxSize = MAX_BODY_SIZE): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Return an Agent suitable for the upstream proxy type. */
function getAgent(proxy: ProxyConfig, isHttpsTarget: boolean): http.Agent | undefined {
  const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';

  if (proxy.type === 'socks4' || proxy.type === 'socks5') {
    return new SocksProxyAgent(`${proxy.type}://${auth}${proxy.host}:${proxy.port}`);
  }

  if (proxy.type === 'http' || proxy.type === 'https') {
    const url = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
    return isHttpsTarget ? new HttpsProxyAgent(url) : new HttpProxyAgent(url);
  }

  return undefined;
}

/* ═══════════════════════════════════════════
   HTTP FORWARDING  (GET, POST, etc.)
   ═══════════════════════════════════════════ */

async function forwardHttp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  proxy: ProxyConfig,
  body: Buffer
): Promise<void> {
  // Browsers send absolute URLs to a proxy, but be defensive
  let target = req.url!;
  if (!target.startsWith('http')) {
    target = `http://${req.headers.host || 'unknown'}${target}`;
  }

  const targetUrl = new URL(target);
  const isHttps = targetUrl.protocol === 'https:';

  // Clone headers and strip hop-by-hop ones
  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  delete headers['proxy-connection'];
  delete headers['proxy-authorization'];

  const options: http.RequestOptions = {
    method: req.method,
    headers,
    agent: getAgent(proxy, isHttps),
    timeout: TIMEOUT_MS
  };

  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const proxyReq = client.request(targetUrl, options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode!, proxyRes.headers);
      proxyRes.pipe(res);

      proxyRes.on('end', resolve);
      proxyRes.on('error', (err) => {
        res.destroy();
        reject(err);
      });
    });

    proxyReq.on('error', reject);
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      reject(new Error('Upstream request timeout'));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
}

/* ═══════════════════════════════════════════
   CONNECT TUNNELING  (HTTPS)
   ═══════════════════════════════════════════ */

/** Tunnel through an HTTP(S) upstream proxy. */
function createHttpTunnel(proxy: ProxyConfig, targetHost: string, targetPort: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let socket: net.Socket | tls.TLSSocket;
    let resolved = false;

    const cleanup = (err?: Error) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        if (err) reject(err);
      }
    };

    // Plain TCP or TLS to the proxy itself
    if (proxy.type === 'https') {
      socket = tls.connect({ host: proxy.host, port: proxy.port, rejectUnauthorized: false });
    } else {
      socket = net.connect(proxy.port, proxy.host);
    }

    socket.setTimeout(TIMEOUT_MS);
    socket.once('timeout', () => cleanup(new Error('HTTP proxy tunnel timeout')));
    socket.once('error', (err) => cleanup(err));

    socket.once('connect', () => {
      const auth = proxy.auth ? Buffer.from(`${proxy.auth.username}:${proxy.auth.password}`).toString('base64') : null;

      let connectReq = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`;
      connectReq += `Host: ${targetHost}:${targetPort}\r\n`;
      if (auth) connectReq += `Proxy-Authorization: Basic ${auth}\r\n`;
      connectReq += '\r\n';

      socket.write(connectReq);

      const onData = (data: Buffer) => {
        const statusLine = data.toString('utf8').split('\r\n')[0];
        if (statusLine.includes('200')) {
          socket.off('data', onData);
          resolved = true;
          resolve(socket);
        } else {
          cleanup(new Error(`HTTP proxy tunnel rejected: ${statusLine}`));
        }
      };

      socket.once('data', onData);
    });
  });
}

/** Tunnel through a SOCKS4/5 upstream proxy. */
async function createSocksTunnel(proxy: ProxyConfig, targetHost: string, targetPort: number): Promise<net.Socket> {
  const result = await SocksClient.createConnection({
    proxy: {
      host: proxy.host,
      port: proxy.port,
      type: proxy.type === 'socks5' ? 5 : 4,
      userId: proxy.auth?.username, // SOCKS4 user-id / SOCKS5 username
      password: proxy.auth?.password // SOCKS5 password
    },
    destination: { host: targetHost, port: targetPort },
    command: 'connect',
    timeout: TIMEOUT_MS
  });
  return result.socket;
}

/* ═══════════════════════════════════════════
   SERVER
   ═══════════════════════════════════════════ */

export async function startProxyServer() {
  const dbProxies = await getWorkingProxies();
  const PROXIES: ProxyConfig[] = dbProxies.map(parseDbProxy).filter((p): p is ProxyConfig => p !== null);

  if (PROXIES.length === 0) {
    console.warn('[proxy] No working proxies found in database — server will reject all requests.');
  }

  const server = http.createServer();

  /* --- Plain HTTP requests --- */
  server.on('request', async (req, res) => {
    let body: Buffer;
    try {
      body = await bufferRequest(req);
    } catch {
      if (!res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'text/plain' });
        res.end('Request body too large');
      }
      return;
    }

    // Log target URL on first connect attempt
    const targetUrl = req.url!.startsWith('http') ? req.url! : `http://${req.headers.host || 'unknown'}${req.url}`;
    console.log(`Connecting to ${targetUrl}...`);

    for (const proxy of PROXIES) {
      try {
        await forwardHttp(req, res, proxy, body);
        return; // Success — stop trying
      } catch (err) {
        console.error(`${proxy.type}://${proxy.host}:${proxy.port} ${(err as Error).message}`);
        // If we already started sending the response, we cannot fallback safely
        if (res.headersSent || res.writableEnded) return;
      }
    }

    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('All upstream proxies failed');
    }
  });

  /* --- HTTPS CONNECT tunnels --- */
  server.on('connect', async (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    const [targetHost, targetPortStr] = req.url!.split(':');
    const targetPort = parseInt(targetPortStr, 10);

    // Log target host on first connect attempt
    console.log(`Connecting to ${targetHost}:${targetPort}...`);

    for (const proxy of PROXIES) {
      let remoteSocket: net.Socket | undefined;

      try {
        if (proxy.type === 'socks4' || proxy.type === 'socks5') {
          remoteSocket = await createSocksTunnel(proxy, targetHost, targetPort);
        } else {
          remoteSocket = await createHttpTunnel(proxy, targetHost, targetPort);
        }

        // Bridge the two TCP streams
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) remoteSocket.write(head);

        clientSocket.pipe(remoteSocket);
        remoteSocket.pipe(clientSocket);

        const cleanup = () => {
          clientSocket.destroy();
          remoteSocket?.destroy();
        };
        clientSocket.on('error', cleanup);
        remoteSocket.on('error', cleanup);
        clientSocket.on('close', cleanup);
        remoteSocket.on('close', cleanup);

        return; // Success
      } catch (err) {
        console.error(`${proxy.type}://${proxy.host}:${proxy.port} ${(err as Error).message}`);
        if (remoteSocket && !remoteSocket.destroyed) remoteSocket.destroy();
        // Continue to next proxy
      }
    }

    clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.destroy();
  });

  server.listen(LISTEN_PORT, () => {
    const count = PROXIES.length;
    console.log(`Proxy server running on http://localhost:${LISTEN_PORT} (${count} upstream proxies)`);
  });

  return { server, PROXIES };
}
