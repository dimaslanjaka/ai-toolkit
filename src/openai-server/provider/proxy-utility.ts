/**
 * Proxy utility functions for OpenAI-compatible server.
 *
 * Handles proxy discovery, caching, and validation for upstream API requests.
 * Supports per-host proxy caching to allow different proxies for different targets.
 */

import { isEmpty } from 'sbg-utility';
import { getSettings, getSQLiteProxy } from '../../database/shared.js';
import { serverLogger } from '../utils.js';

// ---------------------------------------------------------------------------
// Proxy client and formatting
// ---------------------------------------------------------------------------

export async function getProxyClient() {
  return getSQLiteProxy();
}

export function getProxyUrl(item: {
  password?: string | null;
  proxy: string;
  type?: string | null;
  username?: string | null;
}): string {
  let protocol = item.type?.split(/[,-]/)[0];
  if (isEmpty(protocol)) protocol = 'http';
  return `${protocol}://${item.username ? `${item.username}:${item.password}@` : ''}${item.proxy}`;
}

export function getProxyLabel(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.port) return `${parsed.hostname}:${parsed.port}`;
    // Default port for well-known protocols when port is absent
    if (parsed.protocol === 'http:') return `${parsed.hostname}:80`;
    if (parsed.protocol === 'https:') return `${parsed.hostname}:443`;
    return parsed.hostname;
  } catch {
    return proxyUrl;
  }
}

// ---------------------------------------------------------------------------
// Proxy caching
// ---------------------------------------------------------------------------

/**
 * Read the last known working proxy for a given host.
 *
 * Validates that the cached proxy URL has a valid HTTP/HTTPS protocol.
 *
 * @param host - The target host to look up cached proxy for
 * @returns Cached proxy URL, or `undefined` if not found or invalid
 */
export async function readLastWorkingProxy(host: string): Promise<string | undefined> {
  try {
    const settings = await getSettings();
    const proxyUrl = await settings?.getSetting('OPENCODE_CACHED_PROXY');

    if (!proxyUrl) return undefined;

    // Handle bare host:port (e.g. "1.2.3.4:8080") by prepending http://
    // This can happen when the value was stored from the UI without a protocol.
    const normalizedUrl = proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`;

    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    serverLogger.log(`Reusing cached proxy for ${host}: ${getProxyLabel(normalizedUrl)}`, { console: true });
    return normalizedUrl;
  } catch (error) {
    serverLogger.logSync(`Unable to read cached proxy for ${host}: ${error}`, { console: true });
    return undefined;
  }
}

/**
 * Cache a working proxy URL for a given host.
 *
 * @param host - The target host this proxy is for
 * @param proxyUrl - The proxy URL to cache, or `undefined` to skip caching
 */
export async function cacheWorkingProxy(host: string, proxyUrl: string | undefined): Promise<void> {
  if (!proxyUrl) return;

  try {
    const settings = await getSettings();
    await settings?.setSetting('OPENCODE_CACHED_PROXY', proxyUrl);
    serverLogger.log(`Cached proxy for ${host}: ${getProxyLabel(proxyUrl)}`, { console: true });
  } catch (error) {
    serverLogger.logSync(`Unable to cache proxy for ${host}: ${error}`, { console: true });
  }
}

// ---------------------------------------------------------------------------
// Proxy selection
// ---------------------------------------------------------------------------

/**
 * Select a proxy URL for requests to a given host.
 *
 * Attempts to reuse the last known working proxy for efficiency. If no cached
 * proxy exists, queries the system proxy client to find an HTTP proxy configured
 * for the host. The result is logged for diagnostics.
 *
 * @param host - The target host (e.g., 'opencode.ai')
 * @returns A proxy URL string (e.g., `http://proxy.example.com:8080`), or
 *          `undefined` if no proxy is available.
 *
 * @throws May throw if proxy client initialization fails or network issues occur.
 *
 * @example
 * ```ts
 * const proxyUrl = await selectProxyUrl('opencode.ai');
 * if (proxyUrl) {
 *   dispatcher.setProxy(proxyUrl);
 * }
 * ```
 */
export async function selectProxyUrl(host: string): Promise<string | undefined> {
  const cachedProxy = await readLastWorkingProxy(host);
  if (cachedProxy) return cachedProxy;

  const proxyClient = await getProxyClient();
  const item = await proxyClient.getProxyForHost(host, { type: 'http', random: true });
  serverLogger.log(`Proxy search result for ${host}: ${JSON.stringify(item)}`, { console: true });
  return item ? getProxyUrl(item) : undefined;
}
