import { applyPatch } from 'diff';

export function applyUnifiedPatch(originalCode: string, unifiedDiff: string): string {
  const patched = applyPatch(originalCode, unifiedDiff);
  if (!patched) {
    throw new Error('Failed to apply diff. Check the AI-generated diff format.');
  }
  return patched;
}
