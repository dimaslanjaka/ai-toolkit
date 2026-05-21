import { Ollama } from 'ollama';

const ollama = new Ollama({
  host: 'http://127.0.0.1:11434'
});

async function main(): Promise<void> {
  const stream = await ollama.chat({
    model: 'qwen3:8b',
    messages: [
      {
        role: 'user',
        content: 'Hello, stream me the response to this message.'
      }
    ],
    stream: true
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.message.content);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
