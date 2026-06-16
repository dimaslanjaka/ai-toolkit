/**
 * Runner — samples demonstrating buildOpenAIClient usage.
 *
 * Run with: npx tsx src/opencode/utils/buildOpenAIClient.runner.ts
 *
 * NOTE: Requires valid API keys in .opencode.keys.jsonc, NVIDIA_API_KEY,
 * or OPENAI_API_KEY env var depending on the chosen provider.
 * Proxy examples will fail unless you actually have a proxy listening.
 */

import { buildOpenAIClient } from './buildOpenAIClient.js';

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

/* ------------------------------------------------------------------ */
/*  Run a hello prompt                                                */
/* ------------------------------------------------------------------ */
async function main() {
  const { client, model, dispatcher } = await buildOpenAIClient({
    provider: 'openai',
    model: 'gpt-4o-mini',
    proxy: 'http://127.0.0.1:3128'
  });
  console.log('Using model:', model);

  const completion = await client.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }]
    },
    {
      // Per-request fetch options — uses the same proxy agent from the client
      fetchOptions: { dispatcher }
    }
  );

  console.log('Response:', completion.choices[0]?.message?.content);
}

main().catch(console.error);
