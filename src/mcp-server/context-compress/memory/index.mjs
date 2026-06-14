import * as fs from 'fs-extra';
import * as path from 'upath';
import { fileURLToPath } from 'url';
import { formatMemoryToMarkdown, parseMarkdownToMemory } from './markdown.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Find .opencode folder by searching up from current directory
 * @returns {string} Path to .opencode/memory directory
 */
function findOpencodePath() {
  const candidates = [
    path.join(__dirname, '../../../.opencode/memory'),
    path.join(__dirname, '../../.opencode/memory'),
    path.join(__dirname, '../.opencode/memory')
  ];

  for (const candidate of candidates) {
    const opencodeDir = path.dirname(candidate);
    if (fs.pathExistsSync(opencodeDir)) {
      return candidate;
    }
  }

  // Fallback to default path if no candidate found
  return path.join(__dirname, '../../../../.opencode/memory');
}

/**
 * =========================
 * FILE SYSTEM PATHS
 * =========================
 */
const MEMORY_DIR = findOpencodePath();
const MEMORY_FILE = path.join(MEMORY_DIR, 'mcp-context-compress-state.md');

/**
 * =========================
 * MEMORY STORE (FUSION CORE)
 * =========================
 * Stores ONLY compressed state
 */
export const memoryStore = {
  state: {
    tools: new Set(),
    constraints: new Set(),
    intent: 'unknown'
  },
  history: [] // compressed summaries only
};

/**
 * Load memory from disk
 * @returns {Promise<void>}
 */
export async function loadMemory() {
  try {
    if (await fs.pathExists(MEMORY_FILE)) {
      const markdownContent = await fs.readFile(MEMORY_FILE, 'utf-8');
      const parsed = parseMarkdownToMemory(markdownContent);
      memoryStore.state.tools = parsed.state.tools;
      memoryStore.state.constraints = parsed.state.constraints;
      memoryStore.state.intent = parsed.state.intent;
      memoryStore.history = parsed.history;
    }
  } catch (err) {
    console.error('Failed to load memory:', err.message);
  }
}

/**
 * Save memory to disk
 * @returns {Promise<void>}
 */
export async function saveMemory() {
  try {
    await fs.ensureDir(MEMORY_DIR);
    const markdownContent = formatMemoryToMarkdown(memoryStore);
    await fs.writeFile(MEMORY_FILE, markdownContent, 'utf-8');
  } catch (err) {
    console.error('Failed to save memory:', err.message);
  }
}

/**
 * Extract state from text.
 *
 * @param {string} text - The text to extract state from.
 * @returns {{tools: string[], constraints: string[], intent: string}} The extracted state object.
 */
export function extractState(text) {
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
 * Update memory with a new summary and merged state.
 *
 * @param {string} summary - The compressed summary to store in history.
 * @param {{tools: string[], constraints: string[], intent: string}} state - The extracted state object to merge.
 * @returns {Promise<void>}
 */
export async function updateMemory(summary, state) {
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

  // persist to disk
  await saveMemory();
}
