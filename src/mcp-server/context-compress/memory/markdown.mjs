/**
 * Format memory store to Letta-compatible memory markdown block
 * @param {object} memoryStore - The memory store object
 * @returns {string} Markdown string with YAML frontmatter
 */
export function formatMemoryToMarkdown(memoryStore) {
  const sanitizedLabel = 'mcp-context-compress-state';

  // Build YAML frontmatter
  const frontmatter = `---
description: Store compressed context for context-compress MCP server
label: ${sanitizedLabel}
limit: 5000
read_only: false
---
`;

  // Build content with history and state
  let content = '';

  // Add state information
  content += `## Memory State\n`;
  content += `- Tools: ${Array.from(memoryStore.state.tools).join(', ')}\n`;
  content += `- Constraints: ${Array.from(memoryStore.state.constraints).join(', ')}\n`;
  content += `- Intent: ${memoryStore.state.intent}\n\n`;

  // Add history
  if (memoryStore.history.length > 0) {
    content += `## History (${memoryStore.history.length} entries)\n\n`;
    memoryStore.history.forEach((summary, index) => {
      content += `### Entry ${index + 1}\n`;
      content += `${summary}\n\n`;
    });
  }

  return frontmatter + content;
}

/**
 * Parse Letta-compatible memory markdown block back to memory store
 * @param {string} markdownContent - Markdown content with YAML frontmatter
 * @returns {object} Parsed memory store object
 */
export function parseMarkdownToMemory(markdownContent) {
  const memoryStore = {
    state: {
      tools: new Set(),
      constraints: new Set(),
      intent: 'unknown'
    },
    history: []
  };

  // Extract YAML frontmatter using regex (simple but effective)
  const frontmatterMatch = markdownContent.match(/^---\n(.*?)\n---\n(.*)$/s);
  if (!frontmatterMatch) {
    console.error('Invalid memory markdown format - missing frontmatter');
    return memoryStore;
  }

  const frontmatterText = frontmatterMatch[1];
  const content = frontmatterMatch[2];

  // Parse frontmatter
  const frontmatterLines = frontmatterText.split('\n');
  frontmatterLines.forEach((line) => {
    const [key, value] = line.split(': ');
    if (key && value) {
      // Only extract needed fields
      if (key === 'label' && value === 'mcp-context-compress-state') {
        // Valid label, continue
      }
    }
  });

  // Parse content to extract state and history
  const lines = content.split('\n');
  let currentSection = null;
  let currentEntry = null;
  let entryText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('## Memory State')) {
      currentSection = 'state';
      continue;
    } else if (line.startsWith('## History')) {
      currentSection = 'history';
      continue;
    } else if (line.startsWith('### Entry')) {
      if (currentSection === 'history') {
        // Save previous entry
        if (currentEntry && entryText) {
          memoryStore.history.push(entryText.trim());
        }
        // Start new entry
        currentEntry = line;
        entryText = '';
      }
      continue;
    }

    if (currentSection === 'state' && line.includes('Tools:')) {
      const toolsMatch = line.match(/Tools: (.*)/);
      if (toolsMatch && toolsMatch[1]) {
        const tools = toolsMatch[1].split(',').map((t) => t.trim());
        tools.forEach((tool) => tool && memoryStore.state.tools.add(tool));
      }
    } else if (currentSection === 'state' && line.includes('Constraints:')) {
      const constraintsMatch = line.match(/Constraints: (.*)/);
      if (constraintsMatch && constraintsMatch[1]) {
        const constraints = constraintsMatch[1].split(',').map((c) => c.trim());
        constraints.forEach((constraint) => constraint && memoryStore.state.constraints.add(constraint));
      }
    } else if (currentSection === 'state' && line.includes('Intent:')) {
      const intentMatch = line.match(/Intent: (.*)/);
      if (intentMatch && intentMatch[1]) {
        memoryStore.state.intent = intentMatch[1];
      }
    } else if (currentSection === 'history') {
      if (currentEntry !== null) {
        entryText += line + '\n';
      }
    }
  }

  // Add last entry if exists
  if (currentEntry && entryText) {
    memoryStore.history.push(entryText.trim());
  }

  return memoryStore;
}
