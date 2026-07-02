import type { OpenCodeAuthData } from 'binary-collections';
import { buildOpenAIClient } from '../utils/buildOpenAIClient.js';
import type { Proxy } from '../database/ProxyDB.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenCodeFindWorkingProxyResult {
  /** Whether a working proxy was found. */
  result: boolean;
  /** The API key that was tested. */
  apiKey: string;
  /** The working proxy record, if one was found. */
  proxy?: Proxy;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find a working proxy for a given OpenCode API key.
 *
 * Iterates through the supplied proxies, attempting a lightweight chat
 * completion request through each one via the OpenCode API. Returns the
 * first proxy that successfully routes and responds.
 *
 * @param apiKey - The OpenCode API key to test.
 * @param proxies - Array of proxy records to try. Each record should have
 *                  at minimum a `proxy` field (`ip:port`) and optionally
 *                  `type`, `username`, and `password`.
 * @param onFail - Optional callback invoked with the `Proxy` entry when a
 *                 proxy attempt fails. Useful for marking dead proxies.
 * @returns An object indicating whether a working proxy was found, the
 *          tested API key, and the working proxy record if successful.
 *
 * @example
 * ```ts
 * const result = await findWorkingProxy('sk-...', [
 *   { proxy: '1.2.3.4:8080', type: 'http' },
 *   { proxy: '5.6.7.8:1080', type: 'socks5' }
 * ]);
 *
 * if (result.result) {
 *   console.log('Working proxy:', result.proxy?.proxy);
 * }
 * ```
 */
export async function opencodeFindWorkingProxy(
  apiKey: string,
  proxies: Proxy[],
  onFail?: (failedProxy: Proxy) => void
): Promise<OpenCodeFindWorkingProxyResult> {
  if (!proxies.length) {
    return { result: false, apiKey };
  }

  for (const entry of proxies) {
    const type = entry.type || 'http';
    const hasAuth = entry.username && entry.password;
    const authPart = hasAuth ? `${encodeURIComponent(entry.username!)}:${encodeURIComponent(entry.password!)}@` : '';
    const proxyUrl = `${type}://${authPart}${entry.proxy}`;

    try {
      const { client, model, dispatcher } = await buildOpenAIClient({
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        proxy: proxyUrl,
        apiKeys: { opencode: { key: apiKey } } as OpenCodeAuthData
      });

      const completion = await client.chat.completions.create(
        { model, messages: [{ role: 'user', content: 'Hello' }], max_tokens: 5 },
        dispatcher ? { fetchOptions: { dispatcher } } : undefined
      );

      if (completion.choices?.[0]?.message?.content) {
        return { result: true, apiKey, proxy: entry };
      }
    } catch {
      onFail?.(entry);
    }
  }

  return { result: false, apiKey };
}
