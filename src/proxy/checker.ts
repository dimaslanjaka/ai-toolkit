import axios, { AxiosResponse } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface CheckProxyResult {
  proxy: string;
  working: boolean;
  status: number;
  ip?: string;
  error?: string;
  latency?: number;
}

export type ProxyConfig = {
  httpAgent?: any;
  httpsAgent?: any;
  proxy: false;
  timeout: number;
  validateStatus: (status: number) => boolean;
};

export function createProxyConfig(proxyUrl: string, timeout: number = 10000): ProxyConfig {
  const commonConfig: {
    timeout: number;
    validateStatus: (status: number) => boolean;
    proxy: false;
  } = {
    timeout,
    validateStatus: (status: number) => status >= 200 && status < 500,
    proxy: false
  };

  if (proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://')) {
    const agent = new SocksProxyAgent(proxyUrl);
    return {
      httpAgent: agent,
      httpsAgent: agent,
      ...commonConfig
    };
  }

  if (proxyUrl.startsWith('http://') || proxyUrl.startsWith('https://')) {
    const agent = new HttpsProxyAgent(proxyUrl);
    return {
      httpAgent: agent,
      httpsAgent: agent,
      ...commonConfig
    };
  }

  throw new Error(`Unsupported proxy protocol: ${proxyUrl}`);
}

/**
 * Checks if a proxy is working by making a request through it.
 * @param options - Configuration options for the proxy check
 * @param options.proxy - Proxy URL (e.g., 'http://127.0.0.1:8080', 'socks5://127.0.0.1:1080')
 * @param options.endpoint - Target endpoint to test (default: 'https://api.ipify.org?format=json')
 * @param options.timeout - Request timeout in milliseconds (default: 10000)
 * @param options.callback - Optional custom handler to process the response
 * @returns Promise resolving to {@link CheckProxyResult}
 * @example
 * ```ts
 * const result = await checkProxy({ proxy: 'http://127.0.0.1:8080', timeout: 5000 });
 * // { proxy: 'http://127.0.0.1:8080', working: true, status: 200, ip: '1.2.3.4' }
 * ```
 * @example
 * ```ts
 * const result = await checkProxy({
 *   proxy: 'http://127.0.0.1:8080',
 *   callback: (p, e, res) => ({ proxy: p, working: res.status === 200, status: res.status })
 * });
 * ```
 */
export async function checkProxy(options: {
  proxy: string;
  endpoint?: string;
  timeout?: number;
  callback?: (proxy: string, endpoint: string, response: AxiosResponse<any, any, {}>) => CheckProxyResult;
}): Promise<CheckProxyResult> {
  const { proxy, endpoint = 'https://api.ipify.org?format=json', timeout = 10000, callback } = options;
  const start = Date.now();
  try {
    const res = await axios.get(endpoint, {
      ...createProxyConfig(proxy, timeout)
    });
    const latency = Date.now() - start;

    if (callback) {
      return callback(proxy, endpoint, res);
    }

    return {
      proxy: proxy,
      working: true,
      status: res.status,
      ip: res.data?.ip,
      latency
    };
  } catch (err: any) {
    const latency = Date.now() - start;
    const errorCode = err.response?.status ?? err.code;
    console.error(
      `Proxy check failed for ${proxy}:${errorCode ? ` [${errorCode}]` : ''} ${err.response?.statusText || err.message}`
    );

    return {
      proxy: proxy,
      working: false,
      status: err.response?.status || 0,
      error: err.code || err.message,
      latency
    };
  }
}

async function _usage() {
  const proxies = [
    'http://127.0.0.1:8080',
    'https://127.0.0.1:8443',
    'socks4://127.0.0.1:1080',
    'socks5://127.0.0.1:1080'

    // with auth:
    // 'http://user:pass@127.0.0.1:8080',
    // 'socks5://user:pass@127.0.0.1:1080',
  ];

  for (const proxy of proxies) {
    console.log(await checkProxy({ proxy }));
  }

  // Example with callback
  console.log(
    await checkProxy({
      proxy: 'http://127.0.0.1:8080',
      callback: (p, _e, res) =>
        ({
          proxy: p,
          working: res.status === 200,
          status: res.status
        }) as CheckProxyResult
    })
  );
}
