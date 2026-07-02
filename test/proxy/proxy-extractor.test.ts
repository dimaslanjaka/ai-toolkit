import { describe, expect, it } from '@jest/globals';
import { extractProxies, hasValidProxyAuth } from '../../src/proxy/proxy-extractor.js';
import type { Proxy } from '../../src/database/ProxyDB.js';

// ---------------------------------------------------------------------------
// extractProxies
// ---------------------------------------------------------------------------

describe('extractProxies', () => {
  it('parses a single bare ip:port with default http type', () => {
    const result = extractProxies('1.2.3.4:8080');
    expect(result).toEqual([{ proxy: '1.2.3.4:8080', type: 'http' }]);
  });

  it('parses protocol://ip:port', () => {
    const result = extractProxies('http://1.2.3.4:8080');
    expect(result).toEqual([{ proxy: '1.2.3.4:8080', type: 'http' }]);
  });

  it('parses protocol://user:pass@ip:port', () => {
    const result = extractProxies('http://user:pass@1.2.3.4:8080');
    expect(result).toEqual([
      { proxy: '1.2.3.4:8080', type: 'http', username: 'user', password: 'pass' }
    ]);
  });

  it('detects socks4 protocol', () => {
    const result = extractProxies('socks4://10.0.0.1:1080');
    expect(result).toEqual([{ proxy: '10.0.0.1:1080', type: 'socks4' }]);
  });

  it('detects socks5 protocol', () => {
    const result = extractProxies('socks5://10.0.0.1:1080');
    expect(result).toEqual([{ proxy: '10.0.0.1:1080', type: 'socks5' }]);
  });

  it('detects https protocol', () => {
    const result = extractProxies('https://10.0.0.1:8443');
    expect(result).toEqual([{ proxy: '10.0.0.1:8443', type: 'https' }]);
  });

  it('parses socks5 with authentication', () => {
    const result = extractProxies('socks5://alice:secret@10.0.0.1:1080');
    expect(result).toEqual([
      { proxy: '10.0.0.1:1080', type: 'socks5', username: 'alice', password: 'secret' }
    ]);
  });

  it('parses multiline input', () => {
    const input = [
      'http://user:pass@1.1.1.1:8080',
      '2.2.2.2:3128',
      'socks5://3.3.3.3:1080'
    ].join('\n');

    const result = extractProxies(input);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      proxy: '1.1.1.1:8080',
      type: 'http',
      username: 'user',
      password: 'pass'
    });
    expect(result[1]).toEqual({ proxy: '2.2.2.2:3128', type: 'http' });
    expect(result[2]).toEqual({ proxy: '3.3.3.3:1080', type: 'socks5' });
  });

  it('skips empty lines', () => {
    const input = ['1.1.1.1:8080', '', '2.2.2.2:3128'].join('\n');
    expect(extractProxies(input)).toHaveLength(2);
  });

  it('skips comment lines starting with #', () => {
    const input = [
      '# this is a comment',
      '1.1.1.1:8080',
      '// also a comment',
      '2.2.2.2:3128'
    ].join('\n');

    const result = extractProxies(input);
    expect(result).toHaveLength(2);
    expect(result[0].proxy).toBe('1.1.1.1:8080');
    expect(result[1].proxy).toBe('2.2.2.2:3128');
  });

  it('handles CRLF line endings', () => {
    const result = extractProxies('1.1.1.1:8080\r\n2.2.2.2:3128');
    expect(result).toHaveLength(2);
  });

  it('handles authentication with no password (user@host)', () => {
    const result = extractProxies('http://admin@1.1.1.1:8080');
    expect(result).toEqual([
      { proxy: '1.1.1.1:8080', type: 'http', username: 'admin', password: undefined }
    ]);
  });

  it('handles empty password separator (user:@host)', () => {
    const result = extractProxies('http://admin:@1.1.1.1:8080');
    expect(result).toEqual([
      { proxy: '1.1.1.1:8080', type: 'http', username: 'admin', password: undefined }
    ]);
  });

  it('handles hostname proxy addresses', () => {
    const result = extractProxies('http://proxy.example.com:8080');
    expect(result).toEqual([{ proxy: 'proxy.example.com:8080', type: 'http' }]);
  });

  it('returns empty array for empty input', () => {
    expect(extractProxies('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(extractProxies('   \n  \n  ')).toEqual([]);
  });

  it('returns empty array for comment-only input', () => {
    expect(extractProxies('# nothing\n// still nothing')).toEqual([]);
  });

  it('trims whitespace from lines', () => {
    const result = extractProxies('  1.1.1.1:8080  \n  \t 2.2.2.2:3128');
    expect(result).toHaveLength(2);
    expect(result[0].proxy).toBe('1.1.1.1:8080');
    expect(result[1].proxy).toBe('2.2.2.2:3128');
  });
});

// ---------------------------------------------------------------------------
// hasValidProxyAuth
// ---------------------------------------------------------------------------

describe('hasValidProxyAuth', () => {
  it('returns true for valid user:pass', () => {
    expect(hasValidProxyAuth({ username: 'user', password: 'pass' })).toBe(true);
  });

  it('returns true for alphanumeric credentials', () => {
    expect(hasValidProxyAuth({ username: 'alice123', password: 's3cret!' })).toBe(true);
  });

  it('returns false when username is missing', () => {
    expect(hasValidProxyAuth({ password: 'pass' } as Partial<Proxy>)).toBe(false);
  });

  it('returns false when password is missing', () => {
    expect(hasValidProxyAuth({ username: 'user' } as Partial<Proxy>)).toBe(false);
  });

  it('returns false when both are missing', () => {
    expect(hasValidProxyAuth({})).toBe(false);
  });

  it('returns false when username is empty string', () => {
    expect(hasValidProxyAuth({ username: '', password: 'pass' })).toBe(false);
  });

  it('returns false when password is empty string', () => {
    expect(hasValidProxyAuth({ username: 'user', password: '' })).toBe(false);
  });

  it('returns false when username is single hyphen', () => {
    expect(hasValidProxyAuth({ username: '-', password: 'pass' })).toBe(false);
  });

  it('returns false when password is single hyphen', () => {
    expect(hasValidProxyAuth({ username: 'user', password: '-' })).toBe(false);
  });

  it('returns false when username is single comma', () => {
    expect(hasValidProxyAuth({ username: ',', password: 'pass' })).toBe(false);
  });

  it('returns false when password is single comma', () => {
    expect(hasValidProxyAuth({ username: 'user', password: ',' })).toBe(false);
  });

  it('returns false when username is single dot', () => {
    expect(hasValidProxyAuth({ username: '.', password: 'pass' })).toBe(false);
  });

  it('returns false when password is single dot', () => {
    expect(hasValidProxyAuth({ username: 'user', password: '.' })).toBe(false);
  });

  it('returns true for multi-char strings that include hyphens', () => {
    expect(hasValidProxyAuth({ username: 'my-user', password: 'my-pass' })).toBe(true);
  });

  it('returns false when both are single hyphen', () => {
    expect(hasValidProxyAuth({ username: '-', password: '-' })).toBe(false);
  });

  it('returns false when both are single comma', () => {
    expect(hasValidProxyAuth({ username: ',', password: ',' })).toBe(false);
  });

  it('returns false when both are single dot', () => {
    expect(hasValidProxyAuth({ username: '.', password: '.' })).toBe(false);
  });
});
