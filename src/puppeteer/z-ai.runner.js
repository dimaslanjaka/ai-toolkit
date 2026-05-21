import { login } from './z-ai.js';

login().catch((err) => {
  console.error('Error during login:', err);
  process.exit(1);
});
