const net = require('net');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

/**
 * Parse proxy string into host, port, and optional auth.
 *
 * @param {string} proxy - Proxy string in `ip:port` or `user:pass@ip:port` format.
 * @returns {{ host: string, port: number, auth: string | null }} Parsed proxy components.
 */
function parseProxy(proxy) {
  let auth = null;
  let hostPart = proxy;

  if (proxy.includes('@')) {
    const [userPass, host] = proxy.split('@');
    auth = userPass;
    hostPart = host;
  }

  const [host, port] = hostPart.split(':');

  return {
    host,
    port: Number(port),
    auth
  };
}

/**
 * Check if a TCP port is open on the given host.
 *
 * @param {string} host - Target hostname or IP.
 * @param {number} port - Target port.
 * @param {number} timeout - Connection timeout in milliseconds.
 * @returns {Promise<boolean>} Resolves `true` if the port is open, `false` otherwise.
 */
function tcpCheck(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let ok = false;

    socket.setTimeout(timeout);

    socket.once('connect', () => {
      ok = true;
      socket.destroy();
    });

    socket.once('timeout', () => socket.destroy());
    socket.once('error', () => socket.destroy());

    socket.once('close', () => {
      resolve(ok);
    });

    socket.connect(port, host);
  });
}

/**
 * Extract the text content of the `<title>` tag from an HTML string.
 *
 * @param {string} html - Raw HTML string.
 * @returns {string | null} The page title, or `null` if no title tag is found.
 */
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Build a full proxy URL string from type and proxy shorthand.
 *
 * @param {'http' | 'socks4' | 'socks5'} type - Proxy protocol type.
 * @param {string} proxy - Proxy string in `ip:port` or `user:pass@ip:port` format.
 * @returns {string} Fully qualified proxy URL.
 * @throws {Error} If `type` is not one of `http`, `socks4`, or `socks5`.
 */
function buildProxyUrl(type, proxy) {
  const { host, port, auth } = parseProxy(proxy);
  const authPart = auth ? `${auth}@` : '';

  if (type === 'http') {
    return `http://${authPart}${host}:${port}`;
  }

  if (type === 'socks4') {
    return `socks4://${authPart}${host}:${port}`;
  }

  if (type === 'socks5') {
    return `socks5://${authPart}${host}:${port}`;
  }

  throw new Error('Invalid proxy type');
}

/**
 * Make an HTTP request through an HTTP(S) proxy and return the response body.
 *
 * @param {string} proxyUrl - Fully qualified proxy URL (e.g. `http://user:pass@host:port`).
 * @param {number} timeout - Request timeout in milliseconds.
 * @returns {Promise<string>} Response HTML body.
 */
async function requestHttp(proxyUrl, timeout) {
  const agent = new HttpsProxyAgent(proxyUrl);

  const res = await axios.get('http://httpforever.com/', {
    httpAgent: agent,
    httpsAgent: agent,
    timeout,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  return res.data;
}

/**
 * Make an HTTP request through a SOCKS proxy and return the response body.
 *
 * @param {string} proxyUrl - Fully qualified SOCKS proxy URL (e.g. `socks5://user:pass@host:port`).
 * @param {number} timeout - Request timeout in milliseconds.
 * @returns {Promise<string>} Response HTML body.
 */
async function requestSocks(proxyUrl, timeout) {
  const agent = new SocksProxyAgent(proxyUrl);

  const res = await axios.get('http://httpforever.com/', {
    httpAgent: agent,
    httpsAgent: agent,
    timeout,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  return res.data;
}

/**
 * Check whether a proxy server is reachable and functional.
 *
 * Performs a TCP connectivity check first, then issues an HTTP request through
 * the proxy and verifies the response contains the expected page title.
 *
 * @param {Object} options - Reachability check options.
 * @param {'http' | 'socks4' | 'socks5'} options.type - Proxy protocol type.
 * @param {string} options.proxy - Proxy string in `ip:port` or `user:pass@ip:port` format.
 * @param {number} [options.timeout=10000] - Connection and request timeout in milliseconds.
 * @returns {Promise<{ok: boolean, stage?: string, host?: string, port?: number, tcp?: boolean, title?: string | null, expected?: string, proxy?: string, error?: string}>}
 *   Result object indicating whether the proxy is reachable and diagnostic info.
 */
async function isProxyReachable({ type, proxy, timeout = 10000 }) {
  const { host, port } = parseProxy(proxy);

  // 1. TCP check first
  const tcp = await tcpCheck(host, port, timeout);
  if (!tcp) {
    return {
      ok: false,
      stage: 'tcp',
      host,
      port
    };
  }

  const proxyUrl = buildProxyUrl(type, proxy);

  try {
    // 2. Request through proxy
    let html;

    if (type === 'http') {
      html = await requestHttp(proxyUrl, timeout);
    } else {
      html = await requestSocks(proxyUrl, timeout);
    }

    // 3. Validate page title
    const title = extractTitle(html);
    const normalized = title?.toLowerCase();

    return {
      ok: normalized === 'http forever',
      tcp: true,
      title,
      expected: 'http forever',
      proxy: proxyUrl
    };
  } catch (err) {
    return {
      ok: false,
      tcp: true,
      error: err.message,
      proxy: proxyUrl
    };
  }
}

module.exports = { isProxyReachable };
