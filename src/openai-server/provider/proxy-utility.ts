/**
 * Proxy utility functions for OpenAI-compatible server.
 *
 * Handles proxy discovery, caching, and validation for upstream API requests.
 * Supports per-host proxy caching to allow different proxies for different targets.
 */

import fs from 'fs-extra';
import { isEmpty, writefile } from 'sbg-utility';
import path from 'upath';
import SQLiteProxy from '../../database/SQLiteProxy.js';
import { getSQLite } from '../../database/shared.js';
import { serverLogger } from '../utils.js';

// ---------------------------------------------------------------------------
// Proxy path management
// ---------------------------------------------------------------------------

/**
 * Generate the path for storing the last working proxy for a given host.
 *
 * @param host - The target host (e.g., 'opencode.ai', 'api.example.com')
 * @returns Path to the proxy cache file for this host
 */
export function getLastWorkingProxyPath(host: string): string {
  const sanitizedHost = host.replace(/[^a-z0-9.-]/gi, '_');
  return path.join(process.cwd(), 'tmp', 'database', `last-proxy-${sanitizedHost}.txt`);
}

// ---------------------------------------------------------------------------
// Proxy client and formatting
// ---------------------------------------------------------------------------

export async function getProxyClient(): Promise<SQLiteProxy> {
  const sharedDb = await getSQLite();
  return new SQLiteProxy(sharedDb);
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
    return `${parsed.hostname}:${parsed.port}`;
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
  const proxyPath = getLastWorkingProxyPath(host);
  try {
    const proxyUrl = (await fs.readFile(proxyPath, 'utf8')).trim();
    if (!proxyUrl) return undefined;

    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    serverLogger.log(`Reusing cached proxy for ${host}: ${getProxyLabel(proxyUrl)}`);
    return proxyUrl;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      serverLogger.logSync(`Unable to read cached proxy for ${host}: ${error}`);
    }
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

  const proxyPath = getLastWorkingProxyPath(host);
  try {
    writefile(proxyPath, `${proxyUrl}\n`);
    serverLogger.log(`Cached proxy for ${host}: ${getProxyLabel(proxyUrl)}`);
  } catch (error) {
    serverLogger.logSync(`Unable to cache proxy for ${host}: ${error}`);
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
  const item = await proxyClient.getProxyForHost(host, { type: 'http' });
  serverLogger.log(`Proxy search result for ${host}: ${JSON.stringify(item)}`);
  return item ? getProxyUrl(item) : undefined;
}
