import axios from 'axios';
import https from 'https';

const URL = 'https://localhost:5758/v1/chat/completions';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

describe('Weather tool call (streaming)', () => {
  it('streams tool_calls for get_weather with location parameter', async () => {
    const res = await axios.post(
      URL,
      {
        model: 'deepseek-v4-flash-free',
        messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location']
              }
            }
          }
        ],
        stream: true
      },
      {
        headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
        responseType: 'stream',
        httpsAgent
      }
    );

    expect(res.status).toBe(200);

    let raw = '';
    let hasToolCall = false;

    await new Promise<void>((resolve) => {
      res.data.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      res.data.on('end', resolve);
    });

    // Parse SSE lines and look for tool_calls in any chunk
    const lines = raw.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]');
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      const payload = JSON.parse(line.slice(6));
      const delta = payload.choices?.[0]?.delta;
      if (delta?.tool_calls) {
        hasToolCall = true;
        // Verify the tool call structure
        expect(delta.tool_calls[0]).toHaveProperty('id');
        expect(delta.tool_calls[0]).toHaveProperty('function');
        expect(delta.tool_calls[0].function.name).toBe('get_weather');
        break;
      }
    }

    expect(hasToolCall).toBe(true);
  });
});

describe('Complex multi-tool scenario', () => {
  it('routes to the correct tool when multiple tools are defined', async () => {
    const res = await axios.post(
      URL,
      {
        model: 'deepseek-v4-flash-free',
        messages: [{ role: 'user', content: 'What time is it in London right now?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'get_time',
              description: 'Get current time for a timezone',
              parameters: {
                type: 'object',
                properties: { timezone: { type: 'string' } },
                required: ['timezone']
              }
            }
          }
        ],
        tool_choice: 'auto',
        stream: true
      },
      {
        headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
        responseType: 'stream',
        httpsAgent
      }
    );

    expect(res.status).toBe(200);

    let raw = '';
    let toolCallName = '';
    let toolCallArgs = '';

    await new Promise<void>((resolve) => {
      res.data.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      res.data.on('end', resolve);
    });

    const lines = raw.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]');

    for (const line of lines) {
      const payload = JSON.parse(line.slice(6));
      const delta = payload.choices?.[0]?.delta;
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) toolCallName = tc.function.name;
          if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
        }
      }
    }

    // Should have picked get_time (not get_weather) for a time query
    expect(toolCallName).toBe('get_time');
    // Arguments should contain a timezone reference (London / Europe/London)
    expect(toolCallArgs.toLowerCase()).toMatch(/london|utc|europe/);
  });

  it('handles finish_reason=tool_calls in the final streaming chunk', async () => {
    const res = await axios.post(
      URL,
      {
        model: 'deepseek-v4-flash-free',
        messages: [{ role: 'user', content: 'Get me the forecast for Paris' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                  days: { type: 'number', description: 'Number of forecast days' }
                },
                required: ['location']
              }
            }
          }
        ],
        stream: true
      },
      {
        headers: { 'Content-Type': 'application/json', 'X-Request-Provider': 'opencode' },
        responseType: 'stream',
        httpsAgent
      }
    );

    expect(res.status).toBe(200);

    let raw = '';
    let lastFinishReason: string | null = null;

    await new Promise<void>((resolve) => {
      res.data.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      res.data.on('end', resolve);
    });

    const lines = raw.split('\n').filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]');

    for (const line of lines) {
      const payload = JSON.parse(line.slice(6));
      const finishReason = payload.choices?.[0]?.finish_reason;
      if (finishReason) lastFinishReason = finishReason;
    }

    // The last chunk with a finish_reason should say 'tool_calls', not 'stop'
    expect(lastFinishReason).toBe('tool_calls');
  });
});
