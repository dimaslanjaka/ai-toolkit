import { loadDotenv } from 'binary-collections';
import OpenAI from 'openai';

loadDotenv();

const client = new OpenAI({
  baseURL: 'https://api.naga.ac/v1',
  apiKey: process.env.NAGA_API_KEY
});

const dummyTool = {
  type: 'function' as const,
  function: {
    name: 'get_current_weather',
    description: 'Get the current weather',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'The city and state, e.g. San Francisco, CA' },
        format: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'The temperature unit' }
      },
      required: ['location', 'format']
    }
  }
};

async function run() {
  // Basic chat test
  const chatResp = await client.chat.completions.create({
    model: 'llama-4-scout-17b-16e-instruct:free',
    messages: [{ role: 'user', content: "What's 2+2?" }],
    temperature: 0.2
  });

  console.log('[CHAT]');
  console.log(chatResp.choices[0].message.content);

  // Tool calling test
  const toolResp = await client.chat.completions.create({
    model: 'llama-4-scout-17b-16e-instruct:free',
    messages: [{ role: 'user', content: 'What is the weather in San Francisco, CA?' }],
    temperature: 0.2,
    tools: [dummyTool],
    tool_choice: 'auto'
  });

  console.log('\n[TOOL CALLING]');
  const msg = toolResp.choices[0].message;
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    console.log('Tool calls:', JSON.stringify(msg.tool_calls, null, 2));
  } else {
    console.log('No tool calls made');
    console.log('Response:', msg.content);
  }
}

run();
