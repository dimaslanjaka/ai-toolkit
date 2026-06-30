import { fetch, request, ProxyAgent, setGlobalDispatcher } from 'undici';

const TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 20; // stop after this many proxies tried

async function main() {
  // download a free socks5 proxy list
  const proxyListUrl = 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt';
  const proxyListResponse = await fetch(proxyListUrl);
  const proxyListText = await proxyListResponse.text();
  const proxyList = proxyListText
    .split('\n')
    .filter(Boolean)
    .sort(() => Math.random() - 0.5);

  let attempts = 0;
  for (const proxy of proxyList) {
    if (attempts >= MAX_ATTEMPTS) {
      console.log(`Gave up after ${MAX_ATTEMPTS} proxies`);
      break;
    }
    attempts++;

    const proxyAgent = new ProxyAgent({
      uri: `socks5://${proxy}`,
      connect: { timeout: TIMEOUT_MS }
    });

    try {
      // Use globally for native Node.js fetch()
      setGlobalDispatcher(proxyAgent);
      const res = await fetch('https://example.com', {
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      // Or use per-request with Undici's request()
      const { statusCode } = await request('https://example.com', {
        dispatcher: proxyAgent,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      console.log(`✓ ${proxy} — status: ${statusCode}, fetch ok: ${res.ok}`);
      break;
    } catch (err: any) {
      console.log(`✗ ${proxy} — ${err.cause?.code ?? err.code} ${err.message}`);
    } finally {
      await proxyAgent.close();
    }
  }
}

main().catch(console.error);
