import axios from 'axios';
import { getServerState } from './utils.js';
import path from 'upath';
import fs from 'fs-extra';

async function main() {
  // Get server state from saved file
  const serverState = getServerState();

  if (!serverState) {
    const statFile = ['.ts', '.js', '.mjs', '.cjs']
      .map((ext) => path.join(__dirname, 'start' + ext))
      .filter((file) => fs.existsSync(file));
    const relStartFile = path.relative(process.cwd(), statFile[0]);
    let cmd = 'node';
    if (relStartFile.endsWith('.ts')) cmd = 'bun run';
    console.error(`❌ Server state not found. Start the server first with: ${cmd} ${relStartFile}`);
    process.exit(1);
  }

  const baseURL = serverState.url;
  console.log(`📡 Connecting to OpenAI-compatible server at ${baseURL}...`);

  const client = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const payload = {
    model: 'gpt-5-nano',
    messages: [{ role: 'user', content: 'Hello! Respond with a greeting and tell me what model you are.' }],
    stream: false
  };

  try {
    console.log('📤 Sending test request:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n⏳ Waiting for response...');

    const response = await client.post('/v1/chat/completions', payload);

    console.log('\n📥 Response:');
    console.log(JSON.stringify(response.data, null, 2));

    console.log('\n✅ Test success!');
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.response?.data?.error?.message || err.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
