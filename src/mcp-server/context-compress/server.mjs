import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'context-compress',
    version: '1.1.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

/**
 * Precompiled abbreviation protection (faster + safer)
 */
const ABBR_MAP = [
  'e.g.',
  'i.e.',
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'prof.',
  'sr.',
  'jr.',
  'vs.',
  'etc.',
  'fig.',
  'vol.',
  'ph.d.',
  'b.a.',
  'm.a.',
  'inc.',
  'corp.',
  'ltd.',
  'co.',
  'dept.',
  'approx.',
  'est.'
];

const ABBR_REGEX = ABBR_MAP.map((a) => ({
  regex: new RegExp(a.replace(/\./g, '\\.'), 'gi'),
  token: a.replace(/\./g, '§')
}));

function splitSentences(text) {
  if (!text) return [];

  let normalized = text.replace(/\s+/g, ' ').trim();

  // protect abbreviations
  for (const { regex, token } of ABBR_REGEX) {
    normalized = normalized.replace(regex, token);
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/§/g, '.').trim())
    .filter(Boolean);

  return sentences;
}

/**
 * Sentence scoring (balanced, not keyword-biased)
 */
function scoreSentence(sentence, index, total) {
  let score = 0;

  const len = sentence.length;

  // optimal length preference
  if (len > 30 && len < 120) score += 2;
  if (len < 200) score += 1;

  // technical relevance
  if (/(error|fix|create|build|configure|install|optimize|implement|debug)/i.test(sentence)) {
    score += 3;
  }

  // system relevance
  if (/\b(API|MCP|Git|Node|server|config|database|auth|test)\b/i.test(sentence)) {
    score += 2;
  }

  // position importance
  if (index === 0) score += 2;
  if (index === total - 1) score += 1;

  return score;
}

/**
 * Token-aware compression simulation
 * (4 chars ≈ 1 token approximation)
 */
function estimateTokens(str) {
  return Math.ceil((str || '').length / 4);
}

/**
 * Smart summarizer
 */
function summarize(text, options = {}) {
  const { maxSentences = 6, strategy = 'scored', forceCompress = false } = options;

  if (!text) return '';

  const sentences = splitSentences(text);

  if (sentences.length === 0) return '';

  // ALWAYS compress if forced OR long input
  if (!forceCompress && sentences.length <= maxSentences) {
    return sentences.join(' ');
  }

  if (strategy === 'first') {
    return sentences.slice(0, maxSentences).join(' ');
  }

  const scored = sentences.map((s, i) => ({
    text: s,
    score: scoreSentence(s, i, sentences.length),
    index: i
  }));

  const selected = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.text);

  return selected.join(' ');
}

/**
 * Structured state extraction
 */
function extractState(text) {
  if (!text) return { tools: [], constraints: [], intent: 'unknown' };

  const tools = new Set();
  const constraints = new Set();

  const toolMap = [
    { r: /filesystem|file\s*system/i, n: 'filesystem' },
    { r: /\bgit\b/i, n: 'git' },
    { r: /github/i, n: 'github' },
    { r: /fetch|http|axios|request/i, n: 'fetch' },
    { r: /puppeteer|playwright/i, n: 'browser' }
  ];

  for (const t of toolMap) {
    if (t.r.test(text)) tools.add(t.n);
  }

  const constraintMap = [
    { r: /no\s+docker|without\s+docker/i, n: 'no docker' },
    { r: /node\.?js/i, n: 'nodejs' },
    { r: /typescript/i, n: 'typescript' },
    { r: /python/i, n: 'python' }
  ];

  for (const c of constraintMap) {
    if (c.r.test(text)) constraints.add(c.n);
  }

  let intent = 'unknown';
  if (/create|build|make/i.test(text)) intent = 'build';
  else if (/fix|debug|error/i.test(text)) intent = 'debug';
  else if (/optimize|improve/i.test(text)) intent = 'optimize';
  else if (/configure|setup/i.test(text)) intent = 'setup';

  return {
    tools: [...tools],
    constraints: [...constraints],
    intent
  };
}

/**
 * LIST TOOLS
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'compress_context',
        description: 'Compress text into structured summary or state for MCP context reduction',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            mode: {
              type: 'string',
              enum: ['summary', 'state', 'full']
            },
            maxSentences: {
              type: 'number',
              default: 6
            },
            strategy: {
              type: 'string',
              enum: ['scored', 'first']
            },
            forceCompress: {
              type: 'boolean',
              default: false
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
    throw new Error(`Unknown tool: ${name}`);
  }

  const text = args.text || '';
  const mode = args.mode || 'summary';
  const maxSentences = args.maxSentences || 6;
  const strategy = args.strategy || 'scored';
  const forceCompress = args.forceCompress || false;

  const summary = summarize(text, {
    maxSentences,
    strategy,
    forceCompress
  });

  const state = extractState(text);

  const originalTokens = estimateTokens(text);
  const compressedTokens = estimateTokens(summary);

  const result = (() => {
    if (mode === 'state') {
      return { state };
    }

    if (mode === 'full') {
      return {
        summary,
        state,
        original_length: text.length,
        compressed_length: summary.length,
        original_tokens: originalTokens,
        compressed_tokens: compressedTokens,
        compression_ratio: originalTokens > 0 ? ((compressedTokens / originalTokens) * 100).toFixed(1) + '%' : '0%'
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
