import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ROBUST ENV LOADING ---
// Try loading from the script's directory (in case script is in root)
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true, override: true });
// Try loading from parent directory (in case script is in ./src)
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true, override: true });

const client = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: process.env.OLLAMA_API_KEY || 'ollama'
});

function log(...args) {
  console.error('[MCP]', ...args);
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendError(id, code, message, data) {
  send({
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
      ...(data ? { data } : {})
    }
  });
}

const MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:latest';

async function chat({ prompt }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt must be a non-empty string');
  }

  log('MODEL:', MODEL);
  log('PROMPT:', prompt);

  // Check if model is configured correctly to avoid cryptic Ollama errors
  if (!MODEL) {
    throw new Error('OLLAMA_MODEL is not defined in .env or defaults');
  }

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  });

  return response.choices?.[0]?.message?.content || '';
}

const tools = {
  chat: {
    name: 'chat',
    description: 'Chat with local Ollama AI models',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Prompt to send to the AI model' }
      },
      required: ['prompt']
    },
    handler: chat
  }
};

let initialized = false;
process.stdin.setEncoding('utf8');
let buffer = '';

process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      sendError(null, -32700, 'Parse error');
      continue;
    }

    const { id, method, params } = message;
    log('REQUEST:', method);

    if (method === 'initialize') {
      initialized = true;
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            // Explicitly declare these as empty objects/arrays to satisfy strict clients like Cline
            prompts: {},
            resources: {}
          },
          serverInfo: {
            name: 'ollama-ai',
            version: '1.0.0'
          }
        }
      });

      send({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      });
      continue;
    }

    if (!initialized) {
      sendError(id, -32002, 'Server not initialized');
      continue;
    }

    if (method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          tools: Object.values(tools).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        }
      });
      continue;
    }

    // --- FIX: Handle Prompts (Cline compatibility) ---
    if (method === 'prompts/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: { prompts: [] }
      });
      continue;
    }

    // --- FIX: Handle Resources (Cline compatibility) ---
    if (method === 'resources/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: { resources: [] }
      });
      continue;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};
      const tool = tools[toolName];

      if (!tool) {
        sendError(id, -32601, `Unknown tool: ${toolName}`);
        continue;
      }

      try {
        const result = await tool.handler(toolArgs);
        send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: result }]
          }
        });
      } catch (error) {
        // Log the full error to stderr for debugging
        console.error('[TOOL ERROR]', error);
        sendError(id, -32000, error instanceof Error ? error.message : 'Tool execution failed');
      }
      continue;
    }

    // If we reach here, it's an unknown method
    sendError(id, -32601, `Method not found: ${method}`);
  }
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

log(`Ollama MCP server started using model: ${MODEL}`);
