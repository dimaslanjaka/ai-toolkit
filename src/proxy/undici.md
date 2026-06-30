# Undici Proxy Support

As of early 2026 (Undici v8.x), Undici natively supports SOCKS5 proxies alongside standard HTTP/HTTPS proxies.

## Setup

You can use the built-in `ProxyAgent` or `Socks5ProxyAgent` with the global dispatcher or on a per-request basis.

```javascript
import { fetch, request, ProxyAgent, setGlobalDispatcher } from 'undici';

// 1. Initialize the agent (works natively with socks5:// URIs)
const proxy = new ProxyAgent('socks5://user:pass@127.0.0.1:1080');

// 2. Use globally for native Node.js fetch()
setGlobalDispatcher(proxy);
const res = await fetch('https://example.com');

// 3. Or use per-request with Undici's request()
const { statusCode } = await request('https://example.com', { dispatcher: proxy });
```

> full sample at: ../../test/proxy/undici-socks.runner.ts

## Features Supported
- SOCKS5 protocol (`socks5://`)
- HTTP/HTTPS protocols (`http://`, `https://`)
- Basic authentication (RFC 1929 for SOCKS5)
- Connection pooling and keep-alive

*Note: Before v8, developers had to use custom connectors or wrappers. These are no longer necessary.*
