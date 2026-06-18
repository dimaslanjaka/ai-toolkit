import { puterProvider } from './get.js';

async function _main() {
  const puter = await puterProvider();
  puter.ai.chat('Explain quantum computing in simple terms', { model: 'claude-sonnet-4-6' }).then((response: any) => {
    // puter.print(response.message?.content.toString() || 'no response');
    console.log(response.message?.content);
  });
}

_main();
