import { puterProvider } from '../provider/puter/get.js';

// Coding-specific model (more stable for generating diffs)
// const MODEL = 'arcee-ai/coder-large';
const MODEL = 'claude-sonnet-4-6';

/**
 * Extract text from puter AI chat response content, which can be
 * a string, an array of content blocks (Anthropic-style), or an object.
 */
function extractTextContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object' && 'text' in block) return String(block.text);
        return null;
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join('') : null;
  }
  if (content && typeof content === 'object' && 'text' in content) return String((content as { text: unknown }).text);
  return null;
}

export async function generateDiff(originalCode: string, instruction: string): Promise<string | null> {
  const prompt = `You are an expert who only responds with a valid unified diff.

You are a very thorough coding assistant.
Your task: generate a **unified diff** (patch format) to modify the following code based on instructions.

Rules:
- Do not provide any explanation outside the diff.
- Diff must be valid and applicable with standard patch tools.
- Only display the diff itself, no other text.

Original code:
\`\`\`javascript
${originalCode}
\`\`\`

Instruction: ${instruction}

Generated diff:
`;

  const puter = await puterProvider();
  const response = await puter.ai.chat(prompt, { model: MODEL });
  return extractTextContent(response.message?.content);
}
