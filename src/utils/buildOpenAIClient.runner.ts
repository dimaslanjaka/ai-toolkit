/**
 * Runner — tests proxies against an OpenAI-compatible endpoint.
 *
 * Run with: npx tsx src/opencode/utils/buildOpenAIClient.runner.ts
 *
 * Failed proxies are marked dead in a local SQLite database for 1 hour
 * so subsequent runs skip them automatically.
 *
 * NOTE: Requires valid API keys in .opencode.keys.jsonc, NVIDIA_API_KEY,
 * or OPENAI_API_KEY env var depending on the chosen provider.
 * Proxy examples will fail unless you actually have a proxy listening.
 */

import { loadDotenv } from 'binary-collections';
import { getSharedMarker } from '../database/shared.js';
import { downloadProxies } from '../proxy/download-proxies.js';
import { buildOpenAIClient } from './buildOpenAIClient.js';

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
/*  4. SOCKS5 proxy                                                   */
/* ------------------------------------------------------------------ */
// async function exampleSocks5() {
//   console.log('\n--- 4. SOCKS5 proxy ---');
//   const { client, model } = await buildOpenAIClient({
//     provider: 'openai',
//     model: 'gpt-4o-mini',
//     proxy: 'socks5://127.0.0.1:1080'
//   });
//   console.log('Model:', model);
// }

/* ------------------------------------------------------------------ */
/*  Try each proxy, skipping dead ones marked within the last hour    */
/* ------------------------------------------------------------------ */
async function main() {
  const proxies = await downloadProxies();
  console.log(`Testing ${proxies.length} proxies...`);

  // Pre-filter: skip proxies that were marked dead and haven't expired
  const allUrls = proxies.map((p) => `${p.type}://${p.proxy}`);
  const unseen = (await getSharedMarker({ tableName: 'dead_proxies', keyColumn: 'proxy_url' })).filterUnseen(allUrls);
  const remaining = proxies.filter((p) => unseen.pending.has(`${p.type}://${p.proxy}`));

  if (remaining.length === 0) {
    console.log('All proxies are currently marked dead — nothing to test.');
    return;
  }

  console.log(`Skipping ${proxies.length - remaining.length} recently-failed proxies.`);

  for (const entry of remaining) {
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
      (await getSharedMarker({ tableName: 'dead_proxies', keyColumn: 'proxy_url' })).mark(proxyUrl, {
        until: 7,
        unit: 'day'
      });
      // continue to next proxy
    }
  }

  console.error('All proxies exhausted — none worked.');
}

main().catch(console.error);
