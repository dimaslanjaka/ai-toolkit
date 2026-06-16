import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { connectBrowser, waitForDomIdle } from '../../puppeteer/launcher.js';
import isLoggedIn from '../../puppeteer/chatgpt/isLoggedIn.js';
import writeQuestion from '../../puppeteer/chatgpt/writeQuestion.js';
import clickSubmitButton from '../../puppeteer/chatgpt/clickSubmitButton.js';
import waitForInitialResponse from '../../puppeteer/chatgpt/waitForInitialResponse.js';
import type { Browser, Page } from 'puppeteer';

// Browser session management
let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;

/**
 * Get or create a persistent browser session for ChatGPT.
 *
 * Connects to an existing browser via `browser-automation` or `connectBrowser()`.
 * Navigates to chat.openai.com and verifies login status.
 *
 * @returns An object containing the browser and page instances.
 * @throws If the user is not logged in to ChatGPT.
 */
async function getBrowserSession(): Promise<{ browser: Browser; page: Page }> {
  if (browserInstance && pageInstance) {
    try {
      // Check if browser is still connected
      await pageInstance.evaluate(() => true);
      return { browser: browserInstance, page: pageInstance };
    } catch {
      // Browser disconnected, recreate
      browserInstance = null;
      pageInstance = null;
    }
  }

  puppeteer.use(StealthPlugin());

  const browser = await connectBrowser();
  const [existingPage] = await browser.pages();
  const page = existingPage || (await browser.newPage());

  await page.bringToFront();

  const { navigatePage } = await import('../../puppeteer/launcher.js');

  // Check if already on a ChatGPT page — skip navigation if so
  const currentUrl = page.url();
  const isOnChatGPT = currentUrl.includes('chat.openai.com') || currentUrl.includes('chatgpt.com');

  if (!isOnChatGPT) {
    // Navigate to ChatGPT
    const url = 'https://chat.openai.com';
    const nav = await navigatePage(page, url);
    await nav.waitForDomIdle(2000, 15000);
  } else {
    // Already on ChatGPT — just ensure DOM is stable
    await waitForDomIdle(page, 2000, 15000);
  }

  // Check login status
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    throw new Error('ChatGPT login required. Please log in manually at https://chat.openai.com and retry.');
  }

  // Store for reuse
  browserInstance = browser;
  pageInstance = page;

  return { browser, page };
}

/**
 * Send a message to ChatGPT via browser and capture streaming response.
 *
 * @param page - Puppeteer page instance connected to ChatGPT.
 * @param message - The user message to send.
 * @returns Async generator yielding response chunks.
 */
async function* sendChatGPTMessage(page: Page, message: string): AsyncGenerator<string> {
  const { navigatePage } = await import('../../puppeteer/launcher.js');

  // Ensure DOM is ready
  await navigatePage(page, page.url());
  await waitForDomIdle(page, 500, 5000);

  // Write and submit question
  await writeQuestion(page, message);
  const submitted = await clickSubmitButton(page);

  if (!submitted) {
    throw new Error('Failed to submit message to ChatGPT');
  }

  await waitForDomIdle(page, 1000, 30000);
  await waitForInitialResponse(page);

  // Stream response chunks
  let previousText = '';
  let streaming = true;

  while (streaming) {
    const assistantMessages = await page.$$('[data-message-author-role="assistant"]');

    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const currentText = await page.evaluate((element) => element.textContent, lastMessage);

      if (currentText !== previousText) {
        const newChunk = currentText.slice(previousText.length);
        if (newChunk) {
          yield newChunk;
        }
        previousText = currentText;
      }

      const isStreaming = await lastMessage.$('.result-streaming');
      if (!isStreaming) {
        streaming = false;
      }
    }

    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Get the ChatGPT browser provider instance.
 *
 * This returns an object with helper methods for ChatGPT browser interaction.
 * Use `chatgptProvider.chat(message)` to send messages.
 */
export default async function get() {
  const { page } = await getBrowserSession();

  return {
    /**
     * Send a message to ChatGPT and get the full response.
     * @param message - The user message to send.
     * @returns Promise resolving to the full response text.
     */
    async chat(message: string): Promise<string> {
      let fullResponse = '';
      for await (const chunk of sendChatGPTMessage(page, message)) {
        fullResponse += chunk;
      }
      return fullResponse;
    },

    /**
     * Send a message and receive streaming chunks via callback.
     * @param message - The user message to send.
     * @param onChunk - Callback for each response chunk.
     * @returns Promise resolving to the full response text.
     */
    async stream(message: string, onChunk: (chunk: string) => void): Promise<string> {
      let fullResponse = '';
      for await (const chunk of sendChatGPTMessage(page, message)) {
        fullResponse += chunk;
        onChunk(chunk);
      }
      return fullResponse;
    },

    /**
     * Close the browser session.
     */
    async close(): Promise<void> {
      if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        pageInstance = null;
      }
    },

    /**
     * Get the underlying Puppeteer page for custom interactions.
     */
    getPage(): Page {
      if (!pageInstance) {
        throw new Error('ChatGPT browser session not initialized');
      }
      return pageInstance;
    }
  };
}

export const chatgptProvider = get;
