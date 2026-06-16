import { chatgptProvider } from './get.js';

async function _main() {
  try {
    const provider = await chatgptProvider();
    const response = await provider.chat('Explain quantum computing in simple terms');
    console.log(response || 'no response');
  } catch (err) {
    console.error('ChatGPT provider runner error:', err);
    process.exit(1);
  }
}

_main();
