import { run } from './chatgpt/index.js';

// login().catch((error) => {
//   console.error('Error logging into ChatGPT:', error);
// });

run({
  headless: false,
  question: 'What is the capital of France?',
  close: true
}).catch((error) => {
  console.error('Error running ChatGPT:', error);
});
