import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'context-compress-memory',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

/**
 * =========================
 * MEMORY STORE (FUSION CORE)
 * =========================
 * Stores ONLY compressed state
 */
const memoryStore = {
  state: {
    tools: new Set(),
    constraints: new Set(),
    intent: 'unknown'
  },
  history: [] // compressed summaries only
};

/**
 * Abbreviations
 */
const ABBR_MAP = ['e.g.', 'i.e.', 'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.', 'fig.', 'vol.'];

const ABBR_REGEX = ABBR_MAP.map((a) => ({
  regex: new RegExp(a.replace(/\./g, '\\.'), 'gi'),
  token: a.replace(/\./g, '§')
}));

/**
 * Sentence splitter
 */
function splitSentences(text) {
  if (!text) return [];

  let normalized = text.replace(/\s+/g, ' ').trim();

  for (const { regex, token } of ABBR_REGEX) {
    normalized = normalized.replace(regex, token);
  }

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/§/g, '.').trim())
    .filter(Boolean);
}

/**
 * Scoring engine
 */
function scoreSentence(sentence, i, total) {
  let score = 0;

  if (sentence.length < 80) score += 2;
  if (/(error|fix|create|build|configure|optimize|implement)/i.test(sentence)) score += 3;
  if (/\b(MCP|Git|Node|server|API|config)\b/i.test(sentence)) score += 2;
  if (i === 0) score += 2;
  if (i === total - 1) score += 1;

  return score;
}

/**
 * Token estimator
 */
function tokens(str) {
  return Math.ceil((str || '').length / 4);
}

/**
 * =========================
 * CORE COMPRESSION ENGINE
 * =========================
 */
function summarize(text, maxSentences = 5) {
  const sentences = splitSentences(text);

  if (sentences.length <= maxSentences) {
    return sentences.join(' ');
  }

  const ranked = sentences
    .map((s, i) => ({
      s,
      score: scoreSentence(s, i, sentences.length),
      i
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);

  return ranked.join(' ');
}

/**
 * =========================
 * STATE EXTRACTION
 * =========================
 */
function extractState(text) {
  const tools = new Set(memoryStore.state.tools);
  const constraints = new Set(memoryStore.state.constraints);

  if (/filesystem/i.test(text)) tools.add('filesystem');
  if (/git/i.test(text)) tools.add('git');
  if (/github/i.test(text)) tools.add('github');
  if (/puppeteer|playwright/i.test(text)) tools.add('browser');

  if (/node\.?js/i.test(text)) constraints.add('nodejs');
  if (/no\s+docker|cannot\s+use\s+docker|without\s+docker/i.test(text)) constraints.add('no docker');

  let intent = 'unknown';
  if (/create|build/i.test(text)) intent = 'build';
  if (/fix|debug/i.test(text)) intent = 'debug';
  if (/optimize/i.test(text)) intent = 'optimize';
  if (/configure|setup/i.test(text)) intent = 'setup';

  return {
    tools: [...tools],
    constraints: [...constraints],
    intent
  };
}

/**
 * =========================
 * MEMORY FUSION UPDATE
 * =========================
 */
function updateMemory(summary, state) {
  // store compressed history only
  memoryStore.history.push(summary);

  // keep last N only (prevents token explosion)
  if (memoryStore.history.length > 10) {
    memoryStore.history.shift();
  }

  // merge state (NO raw text ever stored)
  memoryStore.state.tools = new Set([...memoryStore.state.tools, ...state.tools]);

  memoryStore.state.constraints = new Set([...memoryStore.state.constraints, ...state.constraints]);

  memoryStore.state.intent = state.intent;
}

/**
 * LIST TOOLS
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'compress_context',
        description: 'Compress + store + merge memory state (fusion engine)',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            mode: {
              type: 'string',
              enum: ['summary', 'state', 'full', 'memory']
            }
          },
          required: ['text']
        }
      }
    ]
  };
});

/**
 * EXECUTE TOOL
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'compress_context') {
    throw new Error('Unknown tool');
  }

  const text = args.text || '';
  const mode = args.mode || 'summary';

  const summary = summarize(text, 5);
  const state = extractState(text);

  // 🔥 MEMORY FUSION STEP
  updateMemory(summary, state);

  const result = (() => {
    if (mode === 'state') {
      return { state: memoryStore.state };
    }

    if (mode === 'memory') {
      return {
        memory: {
          state: memoryStore.state,
          history: memoryStore.history
        }
      };
    }

    if (mode === 'full') {
      return {
        summary,
        state: memoryStore.state,
        memory_size: memoryStore.history.length,
        original_tokens: tokens(text),
        compressed_tokens: tokens(summary)
      };
    }

    return { summary };
  })();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
});

/**
 * START SERVER
 */
const transport = new StdioServerTransport();
await server.connect(transport);
