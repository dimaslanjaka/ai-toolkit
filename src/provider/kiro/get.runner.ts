// Placeholder runner for Kiro provider
// TODO: Implement actual test logic

import { kiroProvider } from './get.js';

async function _main() {
  try {
    const kiro = await kiroProvider();
    console.log('Kiro provider initialized:', kiro.baseUrl);
    // TODO: Add test call, e.g.:
    // const response = await kiro.chat.completions.create({ ... });
    // console.log(response);
  } catch (err) {
    console.error('Kiro provider error:', err);
  }
}

_main();
