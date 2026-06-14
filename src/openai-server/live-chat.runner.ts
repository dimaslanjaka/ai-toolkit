import axios from 'axios';
import { getServerState } from './utils.js';

async function main() {
  // Get server state from saved file
  const serverState = getServerState();

  if (!serverState) {
    console.error('❌ Server state not found. Start the server first with: node dist/openai-server/start.mjs');
    process.exit(1);
  }

  const baseURL = serverState.url;
  console.log(`📡 Connected to OpenAI-compatible server at ${baseURL}`);

  const client = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  // Simple chat loop
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log('\n🤖 OpenAI-Compatible Chat (Puter)');
  console.log('Type "exit" to quit, "model <name>" to change model\n');

  let model = 'gpt-5-nano';
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  try {
    while (true) {
      const userInput = await question('You: ');

      if (userInput.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        break;
      }

      if (userInput.toLowerCase().startsWith('model ')) {
        model = userInput.slice(6).trim();
        console.log(`✅ Model changed to: ${model}\n`);
        continue;
      }

      if (!userInput.trim()) continue;

      messages.push({ role: 'user', content: userInput });

      try {
        console.log('⏳ Waiting for response...\n');

        const response = await client.post('/v1/chat/completions', {
          model,
          messages,
          stream: false,
          max_tokens: 2000
        });

        const assistantMessage = response.data.choices[0]?.message?.content || 'No response';
        messages.push({ role: 'assistant', content: assistantMessage });

        console.log(`Assistant: ${assistantMessage}\n`);
      } catch (err: any) {
        console.error(`❌ Error: ${err.response?.data?.error?.message || err.message}\n`);
        messages.pop(); // Remove the failed user message
      }
    }
  } finally {
    rl.close();
  }
}

main().catch(console.error);
