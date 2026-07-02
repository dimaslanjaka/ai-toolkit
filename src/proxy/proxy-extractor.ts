/**
 * Proxy extractor — parse proxy strings into structured Proxy records.
 *
 * Supports:
 * - Protocol detection: http, https, socks4, socks5 (default http)
 * - Authentication: user:pass inline
 * - Multiline bulk input
 *
 * Format flow:
 *   protocol://user:pass@ip:port  →  protocol://ip:port  →  ip:port
 *
 * @module
 */

import type { Proxy } from '../database/ProxyDB.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PROTOCOLS = ['http', 'https', 'socks4', 'socks5'] as const;
type ValidProtocol = (typeof VALID_PROTOCOLS)[number];

const DEFAULT_PROTOCOL: ValidProtocol = 'http';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Determine if a string is a known proxy protocol.
 */
function isValidProtocol(value: string): value is ValidProtocol {
  return (VALID_PROTOCOLS as readonly string[]).includes(value);
}

/**
 * Parse a single non-empty proxy line into a Proxy record.
 *
 * @param line - A single trimmed, non-empty proxy string.
 * @returns A Proxy object if parseable, otherwise `null`.
 *
 * @example
 * parseProxyLine('http://user:pass@1.2.3.4:8080')
 * // => { proxy: '1.2.3.4:8080', type: 'http', username: 'user', password: 'pass' }
 */
function parseProxyLine(line: string): Proxy | null {
  // 1. Detect and strip protocol prefix (e.g. "http://", "socks5://")
  let type: string = DEFAULT_PROTOCOL;
  let rest = line;

  const protoMatch = rest.match(/^(https?|socks[45]):\/\//);
  if (protoMatch) {
    const rawProto = protoMatch[1].toLowerCase();
    type = isValidProtocol(rawProto) ? rawProto : DEFAULT_PROTOCOL;
    rest = rest.slice(protoMatch[0].length);
  }

  // 2. Detect and strip authentication (user:pass@ or user@)
  let username: string | undefined;
  let password: string | undefined;

  const authMatch = rest.match(/^([^@:]+)(?::([^@]*))?@/);
  if (authMatch) {
    username = authMatch[1] || undefined;
    // If the password group captured an empty string, treat as undefined
    password = authMatch[2] !== undefined ? authMatch[2] || undefined : undefined;
    rest = rest.slice(authMatch[0].length);
  }

  // 3. Remaining portion must be non-empty and contain at least host:port-ish content
  if (!rest || rest.length === 0) return null;

  return { proxy: rest, type, username, password };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract proxy records from a raw input string.
 *
 * Handles multiline input — each non-empty line is parsed independently.
 * Lines starting with `#` or `//` are treated as comments and ignored.
 *
 * Detected protocols: `http`, `https`, `socks4`, `socks5` (defaults to `http`).
 *
 * @param input - Raw string containing one or more proxy entries separated
 *                by newlines.
 * @returns An array of parsed {@link Proxy} objects.
 *
 * @example
 * ```ts
 * const proxies = extractProxies(
 *   'http://user:pass@1.2.3.4:8080\n192.168.1.1:3128'
 * );
 * // [
 * //   { proxy: '1.2.3.4:8080', type: 'http', username: 'user', password: 'pass' },
 * //   { proxy: '192.168.1.1:3128', type: 'http' }
 * // ]
 * ```
 */
export function extractProxies(input: string): Proxy[] {
  const results: Proxy[] = [];

  const lines = input.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;

    const parsed = parseProxyLine(line);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

/**
 * Validate whether a proxy record has usable authentication credentials.
 *
 * Returns `true` only if both `username` and `password` are present,
 * non-empty, and are not single-character tokens commonly used as
 * placeholders — specifically a single hyphen (`-`), comma (`,`), or
 * dot (`.`).
 *
 * @param proxy - A partial proxy object to inspect.
 * @returns `true` if the credentials appear genuine.
 *
 * @example
 * ```ts
 * hasValidProxyAuth({ username: 'user', password: 'pass' });  // true
 * hasValidProxyAuth({ username: '-', password: '-' });        // false
 * hasValidProxyAuth({});                                       // false
 * hasValidProxyAuth({ username: 'u', password: ',' });        // false
 * ```
 */
export function hasValidProxyAuth(proxy: Pick<Proxy, 'username' | 'password'>): boolean {
  const { username, password } = proxy;

  // Must exist and be non-empty
  if (!username || !password) return false;
  if (username.length === 0 || password.length === 0) return false;

  // Reject single-character placeholder tokens
  const invalidTokens = new Set(['-', ',', '.']);
  if (username.length === 1 && invalidTokens.has(username)) return false;
  if (password.length === 1 && invalidTokens.has(password)) return false;

  return true;
}
