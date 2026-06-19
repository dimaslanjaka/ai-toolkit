export function fallbackTitleFromPrompt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();

  if (compact.length <= 42) {
    return compact;
  }

  return `${compact.slice(0, 39).trim()}…`;
}

export function normalizeGeneratedTitle(title: string, fallback: string): string {
  let compact = title
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/^(?:chat\s+)?title\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();

  if (!compact) {
    return fallback;
  }

  if (compact.length > 60) {
    compact = `${compact.slice(0, 57).trim()}…`;
  }

  return compact;
}
