import { BinaryCollectionsConfig, opencodeFindWorkingKey, getOpenCodeAuth, OpenCodeAuthData } from 'binary-collections';
import OpenAI from 'openai';
import { ProxyAgent } from 'undici';

export type BuildOpenAIProvider = 'opencode' | 'nvidia' | 'openai';

export interface BuildOpenAIClientOptions {
  /** The model name to use. */
  model: string;

  /** The AI provider to connect to. No fallback — exactly this provider is used. */
  provider: BuildOpenAIProvider;

  /**
   * HTTP/HTTPS proxy URL for all API requests.
   *
   * Supported formats:
   *   - `http://proxy:8080`
   *   - `https://proxy:8443`
   *   - `http://user:pass@proxy:8080`
   *
   * SOCKS5 is **not** directly supported by the underlying undici `ProxyAgent`.
   * For SOCKS5, use an HTTP-to-SOCKS bridge such as `hpts` or set the
   * `HTTP_PROXY` / `HTTPS_PROXY` environment variables at the process level.
   */
  proxy?: string;

  /**
   * Pre-resolved auth data (only used for `'opencode'` provider).
   *
   * Accepts either:
   *   - `OpenCodeAuthData` — auth shape from `getOpenCodeAuth()` with
   *     `{ opencode: { key } }`.
   *   - `BinaryCollectionsConfig` — config file shape with
   *     `{ opencode: { keys: [{ name, key }] } }`. The first key in the
   *     array is extracted automatically.
   *
   * When provided, skips `getOpenCodeAuth()` and uses these keys directly.
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
 *      the first item is extracted into an `OpenCodeAuthData`-shaped object
 *      with only the `opencode` field populated.
 *
 * @param keys - Auth data in either supported shape.
 * @returns An `OpenCodeAuthData`-shaped object with just the `opencode` token,
 *          or `undefined` if neither shape matched.
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
    const pick = await opencodeFindWorkingKey(keys.opencode.keys, { proxy });
    if (!pick) {
      return undefined;
    }
    return { opencode: { type: 'binary-collections', key: pick.key } } as OpenCodeAuthData;
  }

  return undefined;
}

/**
 * Build fetch options from a proxy URL using undici `ProxyAgent`.
 *
 * @param proxy - HTTP/HTTPS proxy URL (SOCKS5 throws).
 * @returns An object with `fetchOptions` (for the OpenAI constructor) and
 *          the raw `dispatcher` (for per-request overrides).
 */
function buildProxyOptions(proxy: string): {
  dispatcher: ProxyAgent;
  /**  */
  proxy: string;
} {
  if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
    throw new Error(
      `Unsupported proxy protocol: '${proxy.split(':')[0]}'. ` +
        'Only HTTP/HTTPS proxies are supported. ' +
        'For SOCKS5, use an HTTP-to-SOCKS bridge (e.g. `hpts`) or set the HTTP_PROXY/HTTPS_PROXY env vars.'
    );
  }

  const dispatcher = new ProxyAgent(proxy);
  return {
    dispatcher,
    proxy
  };
}

/**
 * Build an OpenAI-compatible client for the specified provider.
 *
 * No fallback logic — the caller chooses exactly one provider. Each provider
 * uses its own authentication method:
 *
 * | Provider    | Auth source                                       | Base URL                                      |
 * |-------------|--------------------------------------------------|-----------------------------------------------|
 * | `opencode`  | `apiKeys` option or `getOpenCodeAuth()`           | `https://opencode.ai/zen/v1`                  |
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
): Promise<{ client: OpenAI; model: string; dispatcher?: ProxyAgent; proxy?: string }> {
  const { model, provider, proxy, apiKeys } = options;

  const proxyOptions = proxy ? buildProxyOptions(proxy) : undefined;
  const dispatcher = proxyOptions?.dispatcher;

  const createClient = (baseURL: string | undefined, apiKey: string) =>
    new OpenAI({
      ...(baseURL ? { baseURL } : {}),
      apiKey,
      ...(dispatcher ? { dispatcher } : {})
    });

  switch (provider) {
    case 'opencode': {
      const auth = apiKeys ? await extractApiKey(apiKeys, proxy) : await getOpenCodeAuth();
      if (!auth?.opencode?.key) {
        throw new Error(
          'No OpenCode API key found.\n' + 'Run `opencode` once to configure, or pass `apiKeys` in options.'
        );
      }
      return {
        client: createClient('https://opencode.ai/zen/v1', auth.opencode.key),
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
