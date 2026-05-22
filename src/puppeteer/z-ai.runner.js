import { run } from './z-ai.js';

// login().catch((err) => {
//   console.error('Error during login:', err);
//   process.exit(1);
// });

run({ question: 'What is the capital of France?', headless: false, close: true }).catch((err) => {
  console.error('Error during execution:', err);
});
