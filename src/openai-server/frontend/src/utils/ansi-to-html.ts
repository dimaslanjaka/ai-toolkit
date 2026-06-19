import Convert from 'ansi-to-html';
import DOMPurify from 'dompurify';

// Reuse a single converter instance for performance
const ansiConverter = new Convert({ newline: true });

/**
 * Convert ANSI escape codes in text to sanitized HTML.
 * Handles ANSI color codes and normalizes dark-blue variants for dark backgrounds.
 */
export function convertAnsiToHtml(ansiText: string): string {
  if (!ansiText) return '';

  try {
    let html = ansiConverter.toHtml(ansiText);

    // Normalize dark-blue variants to a brighter blue for dark backgrounds
    html = html.replace(/style="color:\s*#00A\b/gi, 'style="color:#0099ff"');
    html = html.replace(/style="color:\s*#0000AA\b/gi, 'style="color:#0099ff"');

    return DOMPurify.sanitize(html);
  } catch (_e) {
    // Fallback to plain text if conversion fails
    return ansiText;
  }
}
