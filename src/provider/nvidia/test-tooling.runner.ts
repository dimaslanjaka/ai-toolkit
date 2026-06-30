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

// Models known to support tool calling (based on NVIDIA docs)
const toolSupportedModels = new Set([
  'Llama 3.1 8B',
  'Llama 3.1 70B',
  'Llama 3.1 405B',
  'Llama 3.3 70B',
  'Mistral Small 4 119B',
  'Mistral Large 2',
  'Mixtral 8x22B',
  'GPT-OSS 120B',
  'GPT-OSS 20B',
  'NVIDIA Nemotron 3 Super 120B',
  'NVIDIA Nemotron 3 Nano Omni',
  'MiniMax M3 Preview',
  'GLM-5.1',
  'DeepSeek V4',
  'DeepSeek V4 Flash',
  'ByteDance Seed',
  'Kimi K2.5',
  'Kimi K2.6',
  'Kimi K2 Instruct',
  'MiniMax M2.7',
  'MiniMax M2.5'
]);

// Custom payloads for specific models. Empty object = use defaults.
const customPayloads: Record<string, Record<string, any>> = {
  'DeepSeek R1': {
    chat_template_kwargs: { thinking_mode: 'enabled' }
  },
  'Kimi K2.6': {
    max_tokens: 16384
  }
};

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

function buildToolPayload(modelId: string, custom: Record<string, any> = {}): Record<string, any> {
  return {
    model: modelId,
    messages: [{ role: 'user', content: 'What is the weather in San Francisco, CA?' }],
    max_tokens: 8192,
    temperature: 1.0,
    top_p: 0.95,
    stream: false,
    tools: [dummyTool],
    tool_choice: 'auto',
    ...custom
  };
}

function runRequest(
  name: string,
  modelId: string,
  payload: Record<string, any>
): Promise<{ ok: boolean; toolSupported?: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
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
            resolve({ ok: true, output: output.trim() });
          });
        } else {
          const msg = response.data?.choices?.[0]?.message;
          const hasToolCalls = !!msg?.tool_calls && msg.tool_calls.length > 0;
          const output = msg?.content || '';
          resolve({ ok: true, toolSupported: hasToolCalls, output: output.trim() });
        }
      })
      .catch(async (error) => {
        let errMsg = '';
        if (error.response) {
          errMsg = `HTTP ${error.response.status}`;
          const data = error.response.data;
          if (data && typeof data.on === 'function') {
            let body = '';
            for await (const chunk of data) {
              body += chunk.toString();
            }
            errMsg += ` | ${body}`;
          } else {
            errMsg += ` | ${JSON.stringify(data)}`;
          }
        } else {
          errMsg = error.message;
        }
        resolve({ ok: false, error: errMsg });
      });
  });
}

async function testModel(name: string, modelId: string): Promise<void> {
  const custom = customPayloads[name] || {};
  const chatPayload = buildPayload(modelId, custom);
  const toolPayload = buildToolPayload(modelId, custom);

  console.log(`\n[TESTING] ${name} (${modelId})`);

  // 1. Basic chat test
  const chatResult = await runRequest(name, modelId, chatPayload);
  if (chatResult.ok) {
    console.log(`  [CHAT OK] -> "${chatResult.output}"`);
  } else {
    console.error(`  [CHAT FAIL] -> ${chatResult.error}`);
  }

  // 2. Tool calling test (only for models that claim support)
  if (toolSupportedModels.has(name)) {
    const toolResult = await runRequest(name, modelId, toolPayload);
    if (toolResult.ok) {
      const status = toolResult.toolSupported ? 'SUPPORTED' : 'NOT_SUPPORTED';
      console.log(`  [TOOL ${status}] -> "${toolResult.output}"`);
    } else {
      console.error(`  [TOOL FAIL] -> ${toolResult.error}`);
    }
  } else {
    console.log(`  [TOOL SKIP] -> Not expected to support tools`);
  }
}

async function runAll() {
  console.log('=== NVIDIA NIM Preview Models Test ===');
  for (const [name, modelId] of Object.entries(models)) {
    await testModel(name, modelId);
  }
  console.log('\n=== Done ===');
}

runAll();
