import type { OpenCodeAuthData } from 'binary-collections';
import type { Proxy } from '../database/ProxyDB.js';
import { buildOpenAIClient } from '../utils/buildOpenAIClient.js';
import { checkProxy } from './checker.js';
import { isProxyReachable } from './isProxyReachable.cjs';

export interface OpenCodeFindWorkingProxyResult {
  /** Whether a working proxy was found. */
  result: boolean;
  /** The API key that was tested. */
  apiKey: string;
  /** The working proxy record, if one was found. */
  proxy?: Proxy;
}

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

  const PROTOCOLS = ['http', 'https', 'socks5'] as const;

  for (let i = 0; i < proxies.length; i++) {
    const entry = proxies[i];

    console.log(`[${i + 1}/${proxies.length}] testing ${entry.proxy} (${PROTOCOLS.join(',')}) ...`);

    // Test protocols sequentially - return on first success
    for (const protocol of PROTOCOLS) {
      const hasAuth = entry.username && entry.password;
      const authPart = hasAuth ? `${encodeURIComponent(entry.username!)}:${encodeURIComponent(entry.password!)}@` : '';
      const proxyUrl = `${protocol}://${authPart}${entry.proxy}`;

      // 1. Check proxy reachable before attempting OpenCode request
      try {
        const isReachable = await isProxyReachable({
          type: protocol,
          proxy: entry.proxy,
          username: entry.username,
          password: entry.password
        });

        if (!isReachable) {
          console.log(`  [${protocol}] ❌: Proxy is not reachable`);
          continue;
        } else {
          console.log(`  [${protocol}] ✅: Proxy is reachable`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`  [${protocol}] ❌: Error checking reachability - ${errorMessage}`);
        continue;
      }

      // 2. Attempt check proxy OpenCode
      try {
        const opencodeReachableResult = await checkProxy({
          proxy: proxyUrl,
          endpoint: 'https://opencode.ai/zen/v1/responses',
          callback: (proxy, _endpoint, response) => {
            const responseBodyValid = String(response.data).includes('OpenCode');
            if (responseBodyValid) {
              return { proxy, working: true, status: response.status, ip: response.data?.ip, protocol };
            } else {
              return { proxy, working: false, status: response.status, error: response.statusText };
            }
          }
        });

        if (!opencodeReachableResult?.working) {
          console.log(`  [${protocol}] ❌: Proxy failed OpenCode check`);
          continue;
        } else {
          console.log(`  [${protocol}] ✅: Proxy passed OpenCode check`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`  [${protocol}] ❌: Error during OpenCode check - ${errorMessage}`);
        continue;
      }

      // 3. Attempt make lightweight OpenCode request through proxy
      try {
        console.log(`  [${protocol}] calling buildOpenAIClient...`);
        const { client, model, dispatcher } = await buildOpenAIClient({
          provider: 'opencode',
          model: 'deepseek-v4-flash-free',
          proxy: proxyUrl,
          apiKeys: { opencode: { key: apiKey } } as unknown as OpenCodeAuthData
        });
        console.log(`  [${protocol}] calling client.chat.completions.create...`);
        const completion = await client.chat.completions.create(
          {
            model,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5
          },
          dispatcher ? { fetchOptions: { dispatcher } } : undefined
        );
        console.log(`  [${protocol}] received response:`, completion.choices?.[0]?.message?.content);
        if (completion.choices?.[0]?.message?.content) {
          console.log(`  [${protocol}] ✅: WORKING\n`);
          return { result: true, apiKey, proxy: entry };
        }
        throw new Error('Empty response');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const statusCode = (error as any)?.status ?? (error as any)?.response?.status;
        const statusPart = statusCode ? `[HTTP ${statusCode}]` : '';
        const separator = statusCode ? ' - ' : '';
        console.log(`  [${protocol}] ❌: ${statusPart}${separator}${errorMessage}`);
        continue;
      }
    }

    // All 3 protocols failed for this proxy - mark dead
    onFail?.(entry);
  }

  return { result: false, apiKey };
}
