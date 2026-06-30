import axios from 'axios';
import { loadDotenv } from 'binary-collections';
import models from './models.json' with { type: 'json' };

loadDotenv();

const invokeUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
const stream = false;

const headers = {
  Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
  Accept: stream ? 'text/event-stream' : 'application/json'
};

const modelId = models['MiniMax M3'];

const dummyTool = {
  type: 'function',
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

// --- CHAT TEST ---
const chatPayload = {
  model: modelId,
  messages: [{ role: 'user', content: 'hi' }],
  max_tokens: 8192,
  temperature: 1.0,
  top_p: 0.95,
  stream: stream
};

axios
  .post(invokeUrl, chatPayload, { headers: headers, responseType: stream ? 'stream' : 'json' })
  .then((response) => {
    console.log('--- CHAT RESPONSE ---');
    console.log(JSON.stringify(response.data, null, 2));
  })
  .catch((error) => {
    if (error.response) {
      console.error(`HTTP ${error.response.status}`);
      console.error(error.response.data);
    } else {
      console.error(error);
    }
  });

// --- TOOL TEST ---
const toolPayload = {
  model: modelId,
  messages: [{ role: 'user', content: 'What is the weather in San Francisco, CA?' }],
  max_tokens: 8192,
  temperature: 1.0,
  top_p: 0.95,
  stream: stream,
  tools: [dummyTool],
  tool_choice: 'auto'
};

axios
  .post(invokeUrl, toolPayload, { headers: headers, responseType: stream ? 'stream' : 'json' })
  .then((response) => {
    console.log('\n--- TOOL RESPONSE ---');
    const msg = response.data?.choices?.[0]?.message;
    const hasToolCalls = !!msg?.tool_calls && msg.tool_calls.length > 0;
    console.log(`tool_calls: ${hasToolCalls ? 'YES' : 'NO'}`);
    if (hasToolCalls) {
      console.log('tool_calls:', JSON.stringify(msg.tool_calls, null, 2));
    }
    console.log('content:', msg?.content || '');
    console.log('full response:', JSON.stringify(response.data, null, 2));
  })
  .catch((error) => {
    if (error.response) {
      console.error(`HTTP ${error.response.status}`);
      console.error(error.response.data);
    } else {
      console.error(error);
    }
  });
