import { Ollama, type Message } from 'ollama';

const MODEL = 'qwen3:8b';

const ollama = new Ollama({ headers: { 'Ollama-Client': 'tool-calling-test' } });

const temperatures = new Map<string, string>([
  ['New York', '22°C'],
  ['London', '15°C'],
  ['Tokyo', '18°C']
]);

function getTemperature(city: string): string {
  return temperatures.get(city) ?? 'Unknown';
}

const tools: Parameters<typeof ollama.chat>[0]['tools'] = [
  {
    type: 'function',
    function: {
      name: 'get_temperature',
      description: 'Get the current temperature for a city',
      parameters: {
        type: 'object',
        required: ['city'],
        properties: {
          city: {
            type: 'string',
            description: 'The name of the city'
          }
        }
      }
    }
  }
];

async function chat(messages: Message[]) {
  return ollama.chat({
    model: MODEL,
    messages,
    tools,
    think: true
  });
}

async function main() {
  try {
    const messages: Message[] = [
      {
        role: 'user',
        content: 'What is the temperature in New York?'
      }
    ];

    const response = await chat(messages);

    messages.push(response.message);

    const toolCalls = response.message.tool_calls;

    if (!toolCalls?.length) {
      console.log(response.message.content);
      return;
    }

    for (const call of toolCalls) {
      if (call.function.name !== 'get_temperature') continue;

      const args = call.function.arguments as { city?: string };

      const result = getTemperature(args.city ?? '');

      messages.push({
        role: 'tool',
        content: result
      });
    }

    const finalResponse = await chat(messages);

    console.log(finalResponse.message.content);
  } catch (error) {
    console.error('Application error:', error);
    process.exitCode = 1;
  }
}

main();
