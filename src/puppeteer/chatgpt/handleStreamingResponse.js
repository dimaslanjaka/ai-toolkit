import fs from 'fs-extra';
import path from 'upath';
import { delay } from 'sbg-utility';
import { chatState } from './state.js';

/**
 * Handles streaming response from the assistant, printing output as it arrives.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} [outputFile] - Path to save the response. Defaults to tmp/response.txt.
 * @returns {Promise<void>} Resolves when streaming is complete.
 */
export default async function handleStreamingResponse(page, outputFile = path.join(process.cwd(), 'tmp/response.txt')) {
  let previousText = '';
  let completeResponse = '';
  let newContentDetected = false;
  while (!newContentDetected) {
    const assistantMessages = await page.$$('[data-message-author-role="assistant"]');
    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const currentMessageId = await page.evaluate((element) => element.getAttribute('data-message-id'), lastMessage);
      if (currentMessageId === chatState.lastMessageId) {
        const currentText = await page.evaluate((element) => element.textContent, lastMessage);
        console.log(`Current text: ${currentText}`);
        if (currentText !== previousText) {
          if (chatState.is_streaming) {
            process.stdout.write(currentText.slice(previousText.length));
          } else {
            completeResponse += currentText.slice(previousText.length);
          }
        }
        previousText = currentText;
        const isStreaming = await lastMessage.$('.result-streaming');
        if (!isStreaming) {
          newContentDetected = true;
        }
      } else {
        chatState.lastMessageId = currentMessageId;
      }
    }
    await delay(100);
  }

  if (!chatState.is_streaming) {
    console.log('='.repeat(20) + ' Final Response ' + '='.repeat(20));
    console.log(completeResponse.trim());
    console.log('\n\n');
    fs.ensureDirSync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, completeResponse.trim());
    console.log(`Response saved to ${outputFile}`);
  }
}
