import { login } from './chatgpt.js';

// runChatGpt({
//   headless: false,
//   question: "What is the capital of France?",
//   close: false
// }).catch((error) => {
//   console.error("Error running ChatGPT:", error);
// });

login().catch((error) => {
  console.error('Error logging into ChatGPT:', error);
});
