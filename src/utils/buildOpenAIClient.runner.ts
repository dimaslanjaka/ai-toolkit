/**
 * Runner — samples demonstrating buildOpenAIClient usage.
 *
 * Run with: npx tsx src/opencode/utils/buildOpenAIClient.runner.ts
 *
 * NOTE: Requires valid API keys in .opencode.keys.jsonc, NVIDIA_API_KEY,
 * or OPENAI_API_KEY env var depending on the chosen provider.
 * Proxy examples will fail unless you actually have a proxy listening.
 */

import { loadDotenv } from 'binary-collections';
import { buildOpenAIClient } from './buildOpenAIClient.js';
import { extractProxies } from '../proxy/proxy-extractor.js';
import { downloader } from './downloader.js';

loadDotenv();

/* ------------------------------------------------------------------ */
/*  1. OpenAI provider — no proxy                                     */
/* ------------------------------------------------------------------ */
// async function exampleOpenAiNoProxy() {
//   console.log('\n--- 1. OpenAI, no proxy ---');
//   const { client, model } = await buildOpenAIClient({
//     provider: 'openai',
//     model: 'gpt-4o-mini'
//   });
//   console.log('Model:', model);
// }

/* ------------------------------------------------------------------ */
/*  2. OpenCode provider — no proxy                                   */
/* ------------------------------------------------------------------ */
// async function exampleOpenCodeNoProxy() {
//   console.log('\n--- 2. OpenCode, no proxy ---');
//   const { client, model } = await buildOpenAIClient({
//     provider: 'opencode',
//     model: 'deepseek-v4-flash-free'
//   });
//   console.log('Model:', model);
// }

/* ------------------------------------------------------------------ */
/*  3. NVIDIA provider — with HTTP proxy                              */
/* ------------------------------------------------------------------ */
// async function exampleNvidiaWithProxy() {
//   console.log('\n--- 3. NVIDIA, HTTP proxy ---');
//   const { client, model } = await buildOpenAIClient({
//     provider: 'nvidia',
//     model: 'nvidia/nemotron-3-ultra-550b-a55b',
//     proxy: 'http://127.0.0.1:8080'
//   });
//   console.log('Model:', model);
// }

/* ------------------------------------------------------------------ */
/*  4. SOCKS5 — will throw a clear error                              */
/* ------------------------------------------------------------------ */
// async function exampleSocks5Error() {
//   console.log('\n--- 4. SOCKS5 (expected to error) ---');
//   try {
//     await buildOpenAIClient({
//       provider: 'openai',
//       model: 'gpt-4o-mini',
//       proxy: 'socks5://127.0.0.1:1080'
//     });
//   } catch (err) {
//     console.log('Expected error:', (err as Error).message);
//   }
// }

async function downloadProxies() {
  const [httpRaw, socks5Raw] = await Promise.all([
    downloader('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'),
    downloader('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt')
  ]);

  const http = extractProxies(httpRaw).map((p) => ({ ...p, type: 'http' }));
  const socks5 = extractProxies(socks5Raw).map((p) => ({ ...p, type: 'socks5' }));

  return [...http, ...socks5];
}

/* ------------------------------------------------------------------ */
/*  Run a hello prompt                                                */
/* ------------------------------------------------------------------ */
async function main() {
  const proxies = (await downloadProxies()).sort(() => Math.random() - 0.5);
  console.log(`Testing ${proxies.length} proxies...`);

  for (const entry of proxies) {
    const proxyUrl = `${entry.type}://${entry.proxy}`;

    try {
      console.log(`Trying proxy: ${proxyUrl}`);
      const { client, model, dispatcher } = await buildOpenAIClient({
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        proxy: proxyUrl
      });

      const completion = await client.chat.completions.create(
        {
          model,
          messages: [{ role: 'user', content: 'Say hello in one sentence.' }]
        },
        { fetchOptions: { dispatcher } }
      );

      console.log(`Proxy ${proxyUrl} works!`);
      console.log('Response:', completion.choices[0]?.message?.content);
      return; // first success
    } catch (err) {
      console.warn(`Proxy ${proxyUrl} failed:`, (err as Error).message);
      // continue to next proxy
    }
  }

  console.error('All proxies exhausted — none worked.');
}

main().catch(console.error);
