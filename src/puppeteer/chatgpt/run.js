import fs from 'fs-extra';
import path from 'upath';
import { getCookiePathForUrl, saveCookies } from '../cookies.js';
import { createBrowser, navigatePage } from '../launcher.js';
import { delay } from 'sbg-utility';
import writeQuestion from './writeQuestion.js';
import clickSubmitButton from './clickSubmitButton.js';
import waitForInitialResponse from './waitForInitialResponse.js';
import handleStreamingResponse from './handleStreamingResponse.js';
import isLoggedIn from './isLoggedIn.js';
import login from './login.js';

const MAX_INLINE_QUESTION_FILE_BYTES = 2 * 1024;

/**
 * Automates ChatGPT interactions using Puppeteer. Can send text questions or upload files to ChatGPT.
 *
 * @param {Object} [chatgptOptions={}] - Configuration options for ChatGPT automation.
 * @param {boolean} [chatgptOptions.headless=true] - Whether to run the browser in headless mode.
 * @param {boolean} [chatgptOptions.temporaryChat=true] - Whether to enable temporary chat mode.
 * @param {string} [chatgptOptions.question] - Text question to send to ChatGPT. Either question or questionFile must be provided.
 * @param {string} [chatgptOptions.questionFile] - Path to a file to upload to ChatGPT. Either question or questionFile must be provided.
 * @param {string} [chatgptOptions.responseFile] - Path to save the response. Defaults to tmp/response.txt.
 * @param {boolean} [chatgptOptions.close=true] - Whether to close the browser after completion.
 * @returns {Promise<void>} Resolves when the ChatGPT interaction is complete. Responses are logged to console and saved to specified file.
 * @throws {Error} Throws an error if neither question nor questionFile is provided.
 *
 * @example
 * // Send a text question
 * await runChatGpt({
 *   headless: false,
 *   question: "What is the capital of France?"
 * });
 *
 * @example
 * // Upload a file for analysis
 * await runChatGpt({
 *   headless: false,
 *   questionFile: "./path/to/document.txt"
 * });
 */
export default async function run(options = {}) {
  const {
    headless = true,
    questionFile,
    responseFile = path.join(process.cwd(), 'tmp', 'response.txt'),
    close = true,
    temporaryChat = true
  } = options;

  let { question } = options;

  // Validate input
  if ((!question && !questionFile) || (question && !question.trim()) || (questionFile && !questionFile.trim())) {
    throw new Error('You must provide a question or a question file.');
  }

  let uploadFile = Boolean(questionFile);

  // Inline small file content as prompt text
  if (!question && questionFile) {
    if (!fs.existsSync(questionFile)) {
      throw new Error(`Question file does not exist: ${questionFile}`);
    }

    const stats = fs.statSync(questionFile);

    if (stats.size <= MAX_INLINE_QUESTION_FILE_BYTES) {
      question = fs.readFileSync(questionFile, 'utf8').trim();

      if (!question) {
        throw new Error('Question file is empty.');
      }

      uploadFile = false;

      console.log(`Inlining question file (${stats.size} bytes <= ${MAX_INLINE_QUESTION_FILE_BYTES})`);
    }
  }

  let browser;

  try {
    browser = await createBrowser({ headless });

    const [existingPage] = await browser.pages();
    const page = existingPage || (await browser.newPage());

    await page.bringToFront();

    // Close extra tabs
    const pages = await browser.pages();

    await Promise.all(pages.filter((p) => p !== page).map((p) => p.close()));

    const url = 'https://chat.openai.com';

    const navigate = await navigatePage(page, url);

    await navigate.waitForDomIdle(2000, 15000);

    // Enable/disable temporary chat based on options
    if (temporaryChat) {
      try {
        const tempChatButton = await page.$('button[aria-label="Turn on temporary chat"]');

        if (tempChatButton) {
          await tempChatButton.click();

          console.log('Temporary chat enabled');

          await navigate.waitForDomIdle(1000, 10000);
        }
      } catch (error) {
        console.log(`Temporary chat unavailable: ${error.message}`);
      }
    }

    // Text prompt flow
    if (question) {
      await writeQuestion(page, question);

      const submitted = await clickSubmitButton(page);

      if (!submitted) {
        throw new Error('Failed to submit prompt.');
      }

      await navigate.waitForDomIdle(1000, 30000);

      await waitForInitialResponse(page);

      await handleStreamingResponse(page, responseFile);

      await saveCookies(page, getCookiePathForUrl(url));

      return;
    }

    // File upload flow
    if (!uploadFile || !questionFile) {
      return;
    }

    const loggedIn = await isLoggedIn(page);

    console.log(`Login status: ${loggedIn ? 'Logged in' : 'Not logged in'}`);

    if (!loggedIn) {
      console.log('Please log in to ChatGPT in the opened browser window.');

      return login();
    }

    const plusButton = await page.$('[data-testid="composer-plus-btn"]');

    if (!plusButton) {
      throw new Error('Composer upload button not found.');
    }

    await plusButton.click();

    await delay(500);

    const menuItems = await page.$$('[role="menuitem"]');

    let uploadMenuItem = null;

    for (const item of menuItems) {
      const text = await item.evaluate((el) => el.innerText);

      if (text?.includes('Add photos') && text.includes('files')) {
        uploadMenuItem = item;
        break;
      }
    }

    if (!uploadMenuItem) {
      throw new Error('Could not find "Add photos & files" menu item.');
    }

    await uploadMenuItem.hover();

    await delay(1000);

    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });

    if (!fileInput) {
      throw new Error('File input element not found.');
    }

    console.log(`Uploading file: ${questionFile}`);

    await fileInput.uploadFile(questionFile);

    await navigate.waitForDomIdle(2000, 15000);

    console.log('File uploaded');

    const submitted = await clickSubmitButton(page);

    if (!submitted) {
      throw new Error('Failed to submit uploaded file.');
    }

    await navigate.waitForDomIdle(1000, 30000);

    await waitForInitialResponse(page);

    await handleStreamingResponse(page, responseFile);
  } catch (error) {
    console.error('Error running ChatGPT:', error);

    console.error('\nTroubleshooting:');
    console.error('1. Ensure Google Chrome is installed');
    console.error('2. Try: yarn add puppeteer --force');
    console.error('3. Check antivirus/browser restrictions');
    console.error('4. Close existing Chrome instances');

    throw error;
  } finally {
    if (browser && close) {
      await browser.close();
    }
  }
}

export { run as runChatGpt };
