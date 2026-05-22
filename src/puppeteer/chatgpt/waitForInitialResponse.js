import { delay } from 'sbg-utility';
import { chatState } from './state.js';

/**
 * Waits for the initial assistant response to appear and finish thinking.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {number} [timeout=30000] - Maximum time to wait for the response (ms).
 * @returns {Promise<void>} Resolves when the initial response is ready.
 */
export default async function waitForInitialResponse(page, timeout = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const assistantMessages = await page.$$('[data-message-author-role="assistant"]');
    const currentMessageCount = assistantMessages.length;
    if (currentMessageCount > chatState.messageCount) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const isThinking = await lastMessage.$('.result-thinking');
      if (!isThinking) {
        chatState.lastMessageId = await page.evaluate(
          (element) => element.getAttribute('data-message-id'),
          lastMessage
        );
        chatState.messageCount = currentMessageCount;
        return;
      }
    }
    await delay(100);
  }
  console.log('Timed out waiting for the initial response.');
}
