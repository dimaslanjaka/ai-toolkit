import axios from 'axios';
import { loadDotenv } from 'binary-collections';

loadDotenv();

const invokeUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
const stream = true;

const headers = {
  Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
  Accept: stream ? 'text/event-stream' : 'application/json'
};

const models = {
  'MiniMax M3 Preview': 'minimaxai/minimax-m3-preview',
  'NVIDIA Nemotron 3 Super 120B': 'nvidia/nemotron-3-super-120b-a12b',
  'NVIDIA Nemotron 3 Nano Omni': 'nvidia/nemotron-3-nano-omni',
  'NVIDIA Nemotron 3 Voicechat': 'nvidia/nemotron-3-voicechat',
  'DeepSeek V4': 'deepseek-ai/deepseek-v4',
  'DeepSeek V4 Flash': 'deepseek-ai/deepseek-v4-flash',
  'DeepSeek R1': 'deepseek-ai/deepseek-r1',
  'GLM-5.1': 'zhipuai/glm-5.1',
  'GLM-5': 'zhipuai/glm-5',
  'Kimi K2.5': 'moonshotai/kimi-k2.5',
  'Kimi K2.6': 'moonshotai/kimi-k2.6',
  'Kimi K2 Instruct': 'moonshotai/kimi-k2-instruct',
  'MiniMax M2.7': 'minimaxai/minimax-m2.7',
  'MiniMax M2.5': 'minimaxai/minimax-m2.5',
  'Mistral Small 4 119B': 'mistralai/mistral-small-4-119b',
  'Llama 3.3 70B': 'meta/llama-3.3-70b',
  'GPT-OSS 120B': 'openai/gpt-oss-120b',
  'GPT-OSS 20B': 'openai/gpt-oss-20b',
  'Sarvam-M': 'sarvamai/sarvam-m',
  'ByteDance Seed': 'bytedance/seed',
  'Qwen Image': 'qwen/qwen-image',
  'Qwen Image Edit': 'qwen/qwen-image-edit',
  'BGE M3': 'baai/bge-m3',
  'GLiNER PII': 'urchade/gliner-pii',
  'NVIDIA Synthetic Video Detector': 'nvidia/synthetic-video-detector',
  'NVIDIA Content Safety': 'nvidia/content-safety',
  'NVIDIA Aegis Content Safety': 'nvidia/aegis-content-safety',
  'NVIDIA Cosmos World Generator': 'nvidia/cosmos-world-generator',
  'NVIDIA Cosmos World Foundation': 'nvidia/cosmos-world-foundation',
  'NVIDIA Face Reconstruction': 'nvidia/face-reconstruction',
  'NVIDIA Lip Dub': 'nvidia/lip-dub',
  'NVIDIA ReLight': 'nvidia/religh',
  'NVIDIA Speaker ID': 'nvidia/speaker-id',
  'NVIDIA StreamPETR': 'nvidia/streampetr',
  'NVIDIA Quantum VLM': 'nvidia/quantum-vlm',
  'NVIDIA Riva TTS': 'nvidia/riva-tts',
  'Phi-4': 'microsoft/phi-4',
  'Qwen 2.5': 'qwen/qwen-2.5',
  'Mixtral 8x22B': 'mistralai/mixtral-8x22b',
  'Mistral Large 2': 'mistralai/mistral-large-2',
  'Llama 3.1 8B': 'meta/llama-3.1-8b',
  'Llama 3.1 70B': 'meta/llama-3.1-70b',
  'Llama 3.1 405B': 'meta/llama-3.1-405b'
};

// Custom payloads for specific models. Empty object = use defaults.
const customPayloads: Record<string, Record<string, any>> = {
  'DeepSeek R1': {
    chat_template_kwargs: { thinking_mode: 'enabled' }
  },
  'Kimi K2.6': {
    max_tokens: 16384
  }
  // Add more custom payloads here as needed
};

// Default payload template
function buildPayload(modelId: string, custom: Record<string, any> = {}): Record<string, any> {
  return {
    model: modelId,
    messages: [{ content: 'hello', role: 'user' }],
    max_tokens: 8192,
    temperature: 1.0,
    top_p: 0.95,
    stream: stream,
    ...custom
  };
}

function runModel(name: string, modelId: string): Promise<void> {
  return new Promise((resolve) => {
    const custom = customPayloads[name] || {};
    const payload = buildPayload(modelId, custom);

    console.log('\n[TESTING]', name, `(${modelId})`);
    // console.log('Payload', payload);

    axios
      .post(invokeUrl, payload, { headers: headers, responseType: stream ? 'stream' : 'json' })
      .then((response) => {
        if (stream) {
          let output = '';
          response.data.on('data', (chunk: any) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed?.choices?.[0]?.delta?.content;
                  if (content) output += content;
                } catch {}
              }
            }
          });
          response.data.on('end', () => {
            console.log(`[OK] ${name} -> "${output.trim()}"`);
            resolve();
          });
        } else {
          const message = response.data?.choices?.[0]?.message?.content;
          console.log(`[OK] ${name} -> "${(message || '').trim()}"`);
          resolve();
        }
      })
      .catch(async (error) => {
        if (error.response) {
          console.error(`[FAIL] ${name} -> HTTP ${error.response.status}`);
          const data = error.response.data;
          if (data && typeof data.on === 'function') {
            let body = '';
            for await (const chunk of data) {
              body += chunk.toString();
            }
            console.error(body);
          } else {
            console.error(data);
          }
        } else {
          console.error(`[FAIL] ${name} -> ${error.message}`);
        }
        resolve();
      });
  });
}

// Run all models sequentially
async function runAll() {
  console.log('=== NVIDIA NIM Preview Models Test ===\n');
  for (const [name, modelId] of Object.entries(models)) {
    await runModel(name, modelId);
  }
  console.log('\n=== Done ===');
}

runAll();
