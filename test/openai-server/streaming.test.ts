import axios from 'axios';
import https from 'https';

describe('Streaming API', () => {
  it('streams chunks', async () => {
    const res = await axios.post(
      'https://localhost:5758/v1/chat/completions',
      {
        model: 'deepseek-v4-flash-free',
        messages: [{ role: 'user', content: 'count from 1 to 3' }],
        stream: true
      },
      {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      }
    );

    expect(res.status).toBe(200);

    let chunks = 0;
    let text = '';

    await new Promise<void>((resolve) => {
      res.data.on('data', (chunk: Buffer) => {
        chunks++;
        text += chunk.toString();
      });
      res.data.on('end', resolve);
    });

    expect(chunks).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });
});
