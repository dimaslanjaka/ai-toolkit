/**
 * Reusable downloader with optional file-system caching.
 *
 * Caches responses as JSON files keyed by a SHA-256 hash of the URL.
 * TTL, cache directory, and cache behavior are configurable per call.
 *
 * @module
 */

import fs from 'fs-extra';
import path from 'upath';
import os from 'os';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_DIR = path.join(os.tmpdir(), 'downloads');
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadOptions {
  /** Whether to use cached responses. Default: true */
  useCache?: boolean;
  /** Cache directory. Default: path.join(os.tmpdir(), 'downloads') */
  cacheDir?: string;
  /** Cache TTL in milliseconds. Default: 1 hour */
  cacheTtlMs?: number;
}

// ---------------------------------------------------------------------------
// Downloader
// ---------------------------------------------------------------------------

/**
 * Fetch a URL and return its body text, with optional file-system caching.
 *
 * When caching is enabled, the response is stored as a JSON file at
 * `{cacheDir}/{sha256(url).slice(0,16)}`. Subsequent calls within the TTL
 * return the cached value without a network request.
 *
 * @param url - The URL to fetch.
 * @param options - Optional caching configuration.
 * @returns The response body as a string.
 *
 * @example
 * ```ts
 * const html = await downloader('https://example.com');
 *
 * // Bypass cache for this call
 * const fresh = await downloader('https://example.com', { useCache: false });
 *
 * // Custom cache dir and TTL
 * const data = await downloader('https://example.com/data.json', {
 *   cacheDir: '/tmp/my-cache',
 *   cacheTtlMs: 5 * 60 * 1000  // 5 minutes
 * });
 * ```
 */
export async function downloader(url: string, options?: DownloadOptions): Promise<string> {
  const useCache = options?.useCache ?? true;
  const cacheDir = options?.cacheDir ?? DEFAULT_CACHE_DIR;
  const ttlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  if (useCache) {
    const urlHash = createHash('sha256').update(url).digest('hex').slice(0, 16);
    const cacheFile = path.join(cacheDir, urlHash);

    try {
      const cached = await fs.readJson(cacheFile);
      const age = Date.now() - new Date(cached.downloadedAt).getTime();
      if (age < ttlMs) {
        return cached.content as string;
      }
    } catch {
      // cache miss or expired — proceed to download
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download from ${url}: ${response.statusText}`);
  }
  const content = await response.text();

  if (useCache) {
    const urlHash = createHash('sha256').update(url).digest('hex').slice(0, 16);
    const cacheFile = path.join(cacheDir, urlHash);
    await fs.ensureDir(cacheDir);
    await fs.writeJson(cacheFile, { downloadedAt: new Date().toISOString(), content });
  }

  return content;
}
