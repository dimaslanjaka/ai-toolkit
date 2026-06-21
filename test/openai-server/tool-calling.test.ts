import axios from 'axios';
import https from 'https';

describe('Tool calling', () => {
  it('returns tool_calls when requested', async () => {
    const res = await axios.post(
      'https://localhost:5758/v1/chat/completions',
      {
        model: 'deepseek-v4-flash-free',
        messages: [
          {
            role: 'user',
            content: 'Call a tool named get_time with no arguments'
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_time',
              description: 'Get current time',
              parameters: { type: 'object', properties: {} }
            }
          }
        ],
        tool_choice: 'auto',
        stream: false
      },
      {
        headers: { 'Content-Type': 'application/json' },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    );

    expect(res.status).toBe(200);
    expect(res.data.choices[0].message).toHaveProperty('tool_calls');
  });
});
