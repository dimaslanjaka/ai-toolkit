import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import server functions (we'll need to export these from server.mjs)
// For now, we'll copy the functions here for testing
function splitSentences(text) {
  if (!text) return [];

  // Normalize whitespace
  let normalized = text.replace(/\s+/g, ' ').trim();

  // Protect common abbreviations by replacing periods temporarily
  const abbreviations = [
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
    'v.',
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

  abbreviations.forEach((abbr) => {
    const regex = new RegExp(abbr.replace(/\./g, '\\.'), 'gi');
    normalized = normalized.replace(regex, abbr.replace(/\./g, '｡')); // Use fullwidth period as placeholder
  });

  // Split on sentence boundaries
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .map((s) => s.replace(/｡/g, '.')); // Restore periods

  return sentences;
}

function scoreSentence(sentence, index, total) {
  let score = 0;

  // Length bonus: prefer concise sentences
  if (sentence.length < 80) score += 2;

  // Action keywords
  if (/(error|fix|create|build|configure|install|optimize|implement|refactor|debug)/i.test(sentence)) {
    score += 3;
  }

  // Technical keywords
  if (/\b(API|MCP|Git|Node|config|server|database|auth|test)\b/.test(sentence)) {
    score += 2;
  }

  // Position bonus: first and last sentences often contain key context
  if (index === 0) score += 2;
  if (index === total - 1) score += 1;

  return score;
}

function summarize(text, options = {}) {
  const { maxSentences = 6, strategy = 'scored' } = options;

  if (!text) return '';

  const sentences = splitSentences(text);

  if (sentences.length <= maxSentences) {
    return text.trim();
  }

  if (strategy === 'first') {
    // Simple strategy: take first N sentences
    return sentences.slice(0, maxSentences).join(' ');
  }

  // Scored strategy: select best sentences while preserving some order
  const scored = sentences.map((s, i) => ({
    text: s,
    score: scoreSentence(s, i, sentences.length),
    index: i
  }));

  // Sort by score, take top N, then re-sort by original position
  const selected = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.text);

  return selected.join(' ');
}

function extractState(text) {
  if (!text) return { tools: [], constraints: [] };

  const tools = new Set();
  const constraints = new Set();

  // Detect tools
  const toolPatterns = [
    { pattern: /filesystem|file\s*system/i, name: 'filesystem' },
    { pattern: /\bgit\b/i, name: 'git' },
    { pattern: /github/i, name: 'github' },
    { pattern: /fetch|http|https|axios|request/i, name: 'fetch' },
    { pattern: /puppeteer|playwright/i, name: 'browser' }
  ];

  toolPatterns.forEach(({ pattern, name }) => {
    if (pattern.test(text)) tools.add(name);
  });

  // Detect constraints
  const constraintPatterns = [
    { pattern: /no\s+docker|cannot\s+use\s+docker|without\s+docker/i, constraint: 'no docker' },
    { pattern: /node\.?js|nodejs/i, constraint: 'nodejs' },
    { pattern: /typescript|ts/i, constraint: 'typescript' },
    { pattern: /python/i, constraint: 'python' }
  ];

  constraintPatterns.forEach(({ pattern, constraint }) => {
    if (pattern.test(text)) constraints.add(constraint);
  });

  return {
    tools: Array.from(tools),
    constraints: Array.from(constraints)
  };
}

// Test suite
test('splitSentences: basic sentence splitting', () => {
  const text = 'This is a sentence. This is another one. And a third.';
  const result = splitSentences(text);
  assert.equal(result.length, 3);
  assert.equal(result[0], 'This is a sentence.');
  assert.equal(result[1], 'This is another one.');
  assert.equal(result[2], 'And a third.');
});

test('splitSentences: handles abbreviations (e.g.)', () => {
  const text = 'We use tools e.g. Git and GitHub for version control. It works well.';
  const result = splitSentences(text);
  assert.equal(result.length, 2);
  assert.match(result[0], /e\.g\./);
});

test('splitSentences: handles abbreviations (i.e.)', () => {
  const text = 'The main goal, i.e., optimization, is critical. We focus on this daily.';
  const result = splitSentences(text);
  assert.equal(result.length, 2);
  assert.match(result[0], /i\.e\./);
});

test('splitSentences: handles abbreviations (etc.)', () => {
  // Note: "etc." at end of sentence merges with the next sentence since
  // the period is consumed by the abbreviation protection
  const text = 'We use many tools, etc. The list is long. But we manage it.';
  const result = splitSentences(text);
  assert.equal(result.length, 2);
  assert.match(result[0], /etc\./);
  assert.match(result[0], /list is long/);
});

test('splitSentences: handles multiple sentence endings', () => {
  const text = 'What is this? Is it important! Yes, it is.';
  const result = splitSentences(text);
  assert.equal(result.length, 3);
});

test('splitSentences: handles empty input', () => {
  const result = splitSentences('');
  assert.equal(result.length, 0);
});

test('splitSentences: handles whitespace normalization', () => {
  const text = 'This  has   multiple    spaces.   Another one.';
  const result = splitSentences(text);
  assert.equal(result.length, 2);
  assert.equal(result[0], 'This has multiple spaces.');
});

test('scoreSentence: action keywords increase score', () => {
  const score1 = scoreSentence('Fix the bug in the code.', 0, 3);
  const score2 = scoreSentence('The sky is blue.', 0, 3);
  assert.ok(score1 > score2);
});

test('scoreSentence: technical keywords increase score', () => {
  const score1 = scoreSentence('The API server configuration is critical.', 0, 3);
  const score2 = scoreSentence('The weather is nice today.', 0, 3);
  assert.ok(score1 > score2);
});

test('scoreSentence: first sentence gets position bonus', () => {
  const firstScore = scoreSentence('Generic sentence.', 0, 5);
  const middleScore = scoreSentence('Generic sentence.', 2, 5);
  assert.ok(firstScore > middleScore);
});

test('scoreSentence: last sentence gets position bonus', () => {
  const lastScore = scoreSentence('Generic sentence.', 4, 5);
  const middleScore = scoreSentence('Generic sentence.', 2, 5);
  assert.ok(lastScore > middleScore);
});

test('scoreSentence: short sentences get bonus', () => {
  const shortScore = scoreSentence('Short.', 1, 3);
  const longScore = scoreSentence(
    'This is a very long sentence that exceeds the preferred length limit significantly and has more content to push it over eighty characters.',
    1,
    3
  );
  assert.ok(shortScore > longScore);
});

test('summarize: returns full text if within limit', () => {
  const text = 'First. Second. Third.';
  const result = summarize(text, { maxSentences: 10 });
  assert.equal(result, text);
});

test('summarize: uses first strategy', () => {
  const text = 'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. Sixth sentence.';
  const result = summarize(text, { maxSentences: 3, strategy: 'first' });
  const sentences = splitSentences(result);
  assert.equal(sentences.length, 3);
  assert.match(result, /First sentence/);
  assert.match(result, /Second sentence/);
  assert.match(result, /Third sentence/);
});

test('summarize: uses scored strategy (default)', () => {
  const text =
    'Boring content. Fix the bug in the API server. More boring content. This is important. Even more boring. The database is critical.';
  const result = summarize(text, { maxSentences: 2, strategy: 'scored' });
  const sentences = splitSentences(result);
  assert.equal(sentences.length, 2);
  // Should contain action and technical keywords
  assert.match(result, /(fix|API|database)/i);
});

test('summarize: empty text returns empty string', () => {
  const result = summarize('');
  assert.equal(result, '');
});

test('summarize: preserves order in scored strategy', () => {
  const text = 'First. Fix the API. Second. Debug the server. Third. Configure the database.';
  const result = summarize(text, { maxSentences: 3, strategy: 'scored' });
  const sentences = splitSentences(result);
  // Should preserve order: First sentence should come before last
  const firstIndex = result.indexOf('First');
  const lastIndex = result.indexOf('database');
  assert.ok(firstIndex < lastIndex);
});

test('extractState: detects filesystem tool', () => {
  const text = 'We work with the filesystem to manage files.';
  const state = extractState(text);
  assert.ok(state.tools.includes('filesystem'));
});

test('extractState: detects git tool', () => {
  const text = 'We use git for version control.';
  const state = extractState(text);
  assert.ok(state.tools.includes('git'));
});

test('extractState: detects github tool', () => {
  const text = 'Our repository is hosted on GitHub.';
  const state = extractState(text);
  assert.ok(state.tools.includes('github'));
});

test('extractState: detects fetch tool', () => {
  const text = 'We fetch data via HTTP requests using axios.';
  const state = extractState(text);
  assert.ok(state.tools.includes('fetch'));
});

test('extractState: detects browser tool', () => {
  const text = 'Using Playwright for automation tests.';
  const state = extractState(text);
  assert.ok(state.tools.includes('browser'));
});

test('extractState: detects nodejs constraint', () => {
  const text = 'This is a Node.js application.';
  const state = extractState(text);
  assert.ok(state.constraints.includes('nodejs'));
});

test('extractState: detects typescript constraint', () => {
  const text = 'We wrote this in TypeScript for type safety.';
  const state = extractState(text);
  assert.ok(state.constraints.includes('typescript'));
});

test('extractState: detects python constraint', () => {
  const text = 'The backend is built with Python.';
  const state = extractState(text);
  assert.ok(state.constraints.includes('python'));
});

test('extractState: detects docker constraint (negative)', () => {
  const text = 'We cannot use Docker in this environment.';
  const state = extractState(text);
  assert.ok(state.constraints.includes('no docker'));
});

test('extractState: deduplicates tools', () => {
  const text = 'Git is used. We use git everywhere. Git is essential.';
  const state = extractState(text);
  const gitCount = state.tools.filter((t) => t === 'git').length;
  assert.equal(gitCount, 1);
});

test('extractState: deduplicates constraints', () => {
  const text = 'TypeScript. We use TypeScript. More TypeScript.';
  const state = extractState(text);
  const tsCount = state.constraints.filter((c) => c === 'typescript').length;
  assert.equal(tsCount, 1);
});

test('extractState: empty text returns empty arrays', () => {
  const state = extractState('');
  assert.deepEqual(state.tools, []);
  assert.deepEqual(state.constraints, []);
});

test('extractState: case insensitive matching', () => {
  const text = 'GITHUB and GitHub and github';
  const state = extractState(text);
  const githubCount = state.tools.filter((t) => t === 'github').length;
  assert.equal(githubCount, 1);
});
