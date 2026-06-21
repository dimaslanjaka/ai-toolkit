import axios from 'axios';
import https from 'https';

const URL = 'https://localhost:5758/v1/chat/completions';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

describe('OpenAI-compatible API', () => {
  it('returns a valid chat completion response', async () => {
    const res = await axios.post(
      URL,
      {
        model: 'deepseek-v4-flash-free',
        messages: [{ role: 'user', content: 'Say hello in one word' }],
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        httpsAgent
      }
    );

    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('choices');
    expect(res.data.choices[0]).toHaveProperty('message');
    expect(typeof res.data.choices[0].message.content).toBe('string');
  });
});
