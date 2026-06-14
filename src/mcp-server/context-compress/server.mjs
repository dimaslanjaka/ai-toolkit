import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { memoryStore, loadMemory, extractState, updateMemory } from './memory/index.mjs';

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
  await updateMemory(summary, state);

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
loadMemory()
  .then(() => {
    const transport = new StdioServerTransport();
    return server.connect(transport);
  })
  .catch(console.error);
