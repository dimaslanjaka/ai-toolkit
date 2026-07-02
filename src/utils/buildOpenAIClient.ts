import type { BinaryCollectionsConfig, OpenCodeAuthData } from 'binary-collections';
import OpenAI from 'openai';
import { fetch as undiciFetch, ProxyAgent, Socks5ProxyAgent, type Dispatcher } from 'undici';
import { opencodeFindWorkingProxy } from '../proxy/opencodeFindWorkingKey.js';
import { getOpenCodeKeysManager } from '../database/shared.js';
import type { Proxy } from '../database/ProxyDB.js';

export type BuildOpenAIProvider = 'opencode' | 'nvidia' | 'openai';

export interface BuildOpenAIClientOptions {
  /** The model name to use. */
  model: string;

  /** The AI provider to connect to. No fallback — exactly this provider is used. */
  provider: BuildOpenAIProvider;

  /**
   * HTTP/HTTPS or SOCKS5 proxy URL for all API requests.
   *
   * Supported formats:
   *   - `http://proxy:8080`
   *   - `https://proxy:8443`
   *   - `http://user:pass@proxy:8080`
   *   - `socks5://proxy:1080`
   *   - `socks5://user:pass@proxy:1080`
   */
  proxy?: string;

  /**
   * Pre-resolved auth data (only used for `'opencode'` provider).
   *
   * Accepts either:
   *   - `OpenCodeAuthData` — auth shape with
   *     `{ opencode: { key } }`.
   *   - `BinaryCollectionsConfig` — config file shape with
   *     `{ opencode: { keys: [{ name, key }] } }`. The first key in the
   *     array is extracted automatically.
   *
   * When provided, skips the database fallback and uses these keys directly.
   * Ignored for `'nvidia'` and `'openai'` providers (they use env vars).
   */
  apiKeys?: OpenCodeAuthData | BinaryCollectionsConfig;
}

/**
 * Extract an `opencode` key token from a pre-resolved auth object.
 *
 * Supports two runtime shapes:
 *   1. **OpenCodeAuthData** — detected by `opencode.key` → returned as-is.
 *   2. **BinaryCollectionsConfig** — detected by `opencode.keys` (array) →
 *      the first item is extracted into an `OpenCodeAuthData`-shaped object.
 *      If a `proxy` is also configured, it verifies the proxy works with that
 *      key before returning.
 *
 * @param keys - Auth data in either supported shape.
 * @param proxy - Optional proxy URL used to verify the key is reachable.
 * @returns An `OpenCodeAuthData`-shaped object with just the `opencode` token,
 *          or `undefined` if neither shape matched or proxy verification failed.
 */
async function extractApiKey(
  keys: OpenCodeAuthData | BinaryCollectionsConfig,
  proxy?: string
): Promise<OpenCodeAuthData | undefined> {
  if (!('opencode' in keys) || typeof keys.opencode !== 'object' || keys.opencode === null) {
    return undefined;
  }

  // OpenCodeAuthData shape: { opencode: { key: string } }
  if ('key' in keys.opencode) {
    return keys as OpenCodeAuthData;
  }

  // BinaryCollectionsConfig shape: { opencode: { keys: KeyData[] } }
  if ('keys' in keys.opencode && Array.isArray(keys.opencode.keys) && keys.opencode.keys.length > 0) {
    const firstKey = keys.opencode.keys[0];

    // If a proxy is configured, verify it actually works with this key.
    if (proxy) {
      const url = new URL(proxy);
      const proxyObj: Proxy = {
        proxy: url.hostname + (url.port ? `:${url.port}` : ''),
        type: url.protocol.replace(':', ''),
        username: url.username || undefined,
        password: url.password || undefined
      };

      const { result } = await opencodeFindWorkingProxy(firstKey.key, [proxyObj]);
      if (!result) return undefined;
    }

    return { opencode: { type: 'binary-collections', key: firstKey.key } } as OpenCodeAuthData;
  }

  return undefined;
}

/**
 * Build a dispatcher from a proxy URL — HTTP/HTTPS via undici `ProxyAgent`
 * or SOCKS5 via undici `Socks5ProxyAgent`.
 *
 * @param proxy - HTTP/HTTPS/SOCKS5 proxy URL.
 * @returns An object with `dispatcher` (for the OpenAI constructor) and
 *          the raw `proxy` string.
 */
function buildProxyOptions(proxy: string): {
  dispatcher: Dispatcher;
  proxy: string;
} {
  if (proxy.startsWith('socks5://') || proxy.startsWith('socks://')) {
    return { dispatcher: new Socks5ProxyAgent(proxy), proxy };
  }

  if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
    throw new Error(
      `Unsupported proxy protocol: '${proxy.split(':')[0]}'. ` + 'Supported: http://, https://, socks5://, socks://'
    );
  }

  return { dispatcher: new ProxyAgent(proxy), proxy };
}

/**
 * Build an OpenAI-compatible client for the specified provider.
 *
 * No fallback logic — the caller chooses exactly one provider. Each provider
 * uses its own authentication method:
 *
 * | Provider    | Auth source                                       | Base URL                                      |
 * |-------------|--------------------------------------------------|-----------------------------------------------|
 * | `opencode`  | `apiKeys` option or first enabled key from DB    | `https://opencode.ai/zen/v1`                  |
 * | `nvidia`    | `NVIDIA_API_KEY` env var                          | `https://integrate.api.nvidia.com/v1`          |
 * | `openai`    | `OPENAI_API_KEY` env var                          | default OpenAI endpoint                       |
 *
 * @param options - Provider + model + optional proxy / apiKeys.
 * @returns An object containing the configured OpenAI client, the model name,
 *          and the optional undici `ProxyAgent` dispatcher.
 * @throws If the required API key for the chosen provider is missing.
 */
export async function buildOpenAIClient(
  options: BuildOpenAIClientOptions
): Promise<{ client: OpenAI; model: string; dispatcher?: Dispatcher; proxy?: string }> {
  const { model, provider, proxy, apiKeys } = options;

  const proxyOptions = proxy ? buildProxyOptions(proxy) : undefined;
  const dispatcher = proxyOptions?.dispatcher;

  const createClient = (baseURL: string | undefined, apiKey: string) =>
    new OpenAI({
      ...(baseURL ? { baseURL } : {}),
      apiKey,
      fetch: undiciFetch as any,
      ...(dispatcher ? { fetchOptions: { dispatcher } } : {})
    });

  switch (provider) {
    case 'opencode': {
      let key: string | undefined;

      if (apiKeys) {
        const auth = await extractApiKey(apiKeys, proxy);
        key = auth?.opencode?.key;
      } else {
        // Fall back to database — use the first enabled key
        const keysManager = await getOpenCodeKeysManager();
        await keysManager.initialize();
        const dbKeys = await keysManager.getEnabledKeysWithProxy();
        if (dbKeys.length > 0) {
          key = dbKeys[0].key;
        }
      }

      if (!key) {
        throw new Error(
          'No OpenCode API key found.\n' + 'Add a key in the provider settings, or pass `apiKeys` in options.'
        );
      }
      return {
        client: createClient('https://opencode.ai/zen/v1', key),
        model,
        dispatcher,
        proxy
      };
    }

    case 'nvidia': {
      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        throw new Error(
          'NVIDIA_API_KEY environment variable is not set.\n' +
            'Set NVIDIA_API_KEY in your environment or use a different provider.'
        );
      }
      return {
        client: createClient('https://integrate.api.nvidia.com/v1', apiKey),
        model,
        dispatcher,
        proxy
      };
    }

    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY environment variable is not set.\n' +
            'Set OPENAI_API_KEY in your environment or use a different provider.'
        );
      }
      return {
        client: createClient(undefined, apiKey),
        model,
        dispatcher,
        proxy
      };
    }
  }
}
