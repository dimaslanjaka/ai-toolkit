import fs from 'fs-extra';
import path from 'upath';
import { getCookiePathForUrl, saveCookies } from './cookies.js';
import { createBrowser, navigatePage, NAVIGATION_TIMEOUT_MS, NETWORK_IDLE_TIMEOUT_MS } from './launcher.js';

const MAX_INLINE_QUESTION_FILE_BYTES = 2 * 1024;

/**
 * Writes a question to the ChatGPT prompt textarea, handling multi-line questions.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} question - The question text to write.
 * @returns {Promise<void>} Resolves when the question is written.
 */
async function writeQuestion(page, question) {
  const promptTextarea = await page.waitForSelector('#prompt-textarea', { timeout: 30000 });
  if (!promptTextarea) {
    console.log(
      'Cannot find the prompt input on the webpage. Please check whether you have access to chat.openai.com without logging in via your browser.'
    );
    return;
  }

  // Inject the full prompt instantly and emit input-like events so the UI reacts.
  await page.evaluate((text) => {
    const promptEl = document.querySelector('#prompt-textarea');
    if (!promptEl) {
      return;
    }

    promptEl.focus();
    promptEl.innerHTML = '';

    const lines = String(text).split('\n');
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      promptEl.appendChild(p);
    }

    promptEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    promptEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    promptEl.dispatchEvent(new Event('change', { bubbles: true }));
  }, question);

  // If the app state did not pick up the DOM injection, use keyboard insertion as a reliable fallback.
  const hasPromptText = await page.evaluate(() => {
    const promptEl = document.querySelector('#prompt-textarea');
    return Boolean(promptEl && promptEl.textContent && promptEl.textContent.trim().length > 0);
  });

  if (!hasPromptText) {
    console.log('Prompt state not updated by DOM injection. Falling back to keyboard insertText.');
    await promptTextarea.click({ clickCount: 1 });
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.insertText(question);
  }
}

/**
 * Clicks the submit button in ChatGPT interface, trying different button variants.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @returns {Promise<boolean>} Resolves to true when submission is detected, otherwise false.
 */
async function clickSubmitButton(page) {
  console.log('Attempting to click the submit button...');
  try {
    const userMessageCountBefore = await page.$$eval(
      '[data-message-author-role="user"]',
      (elements) => elements.length
    );

    const waitForSubmit = async (timeout = 5000) => {
      try {
        await page.waitForFunction(
          (previousCount) => {
            const currentCount = document.querySelectorAll('[data-message-author-role="user"]').length;
            return currentCount > previousCount;
          },
          { timeout },
          userMessageCountBefore
        );
        return true;
      } catch {
        return false;
      }
    };

    await page
      .waitForFunction(
        () => {
          const candidates = [
            document.querySelector('[data-testid="fruitjuice-send-button"]'),
            document.querySelector('#composer-submit-button'),
            document.querySelector('[data-testid="send-button"]')
          ].filter(Boolean);

          return candidates.some((button) => {
            const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
            const isVisible = button.offsetParent !== null;
            return !isDisabled && isVisible;
          });
        },
        { timeout: 5000 }
      )
      .catch(() => {
        // Continue to diagnostics below even if no enabled button was found within timeout.
      });

    const buttonDetails = await page.evaluate(() => {
      const selectors = [
        '[data-testid="fruitjuice-send-button"]',
        '#composer-submit-button',
        '[data-testid="send-button"]'
      ];

      const details = selectors.map((selector) => {
        const el = document.querySelector(selector);
        const exists = Boolean(el);
        const disabled = exists ? Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true') : null;
        const visible = exists ? el.offsetParent !== null : null;
        return { selector, exists, disabled, visible };
      });

      return details;
    });

    console.log(`Submit button details: ${JSON.stringify(buttonDetails)}`);
    const clickable = buttonDetails.find((item) => item.exists && item.visible && item.disabled === false);
    const selectedSelector = clickable ? clickable.selector : null;

    if (selectedSelector) {
      await page.click(selectedSelector);
      console.log(`Clicked submit button selector: ${selectedSelector}`);

      if (await waitForSubmit(5000)) {
        console.log('Submission detected after selector click.');
        return true;
      }

      // Fallback: force a DOM click in case pointer-interception blocked page.click.
      const forcedClickWorked = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) {
          return false;
        }

        el.click();
        return true;
      }, selectedSelector);

      if (forcedClickWorked) {
        console.log(`Forced DOM click on selector: ${selectedSelector}`);
        if (await waitForSubmit(5000)) {
          console.log('Submission detected after forced DOM click.');
          return true;
        }
      }
    }

    console.log('Submit button path did not submit. Trying Enter key fallback on prompt.');
    await page.focus('#prompt-textarea');
    await page.keyboard.press('Enter');
    if (await waitForSubmit(5000)) {
      console.log('Submission detected after Enter key fallback.');
      return true;
    }

    // Final fallback: submit the nearest composer form.
    const didRequestSubmit = await page.evaluate(() => {
      const prompt = document.querySelector('#prompt-textarea');
      if (!prompt) {
        return false;
      }

      const form = prompt.closest('form');
      if (!form) {
        return false;
      }

      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
      return true;
    });

    if (didRequestSubmit) {
      console.log('Triggered form submit fallback.');
      if (await waitForSubmit(5000)) {
        console.log('Submission detected after form submit fallback.');
        return true;
      }
    }

    console.log('Failed to submit prompt after all strategies.');
    return false;
  } catch (e) {
    console.log(`Failed to click the send button: ${e}`);
    return false;
  }
}

let lastMessageId = null;
let messageCount = 0;
const is_streaming = false; // Set to true if you want to stream the response

/**
 * Creates a promise that resolves after a specified number of milliseconds.
 *
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>} A promise that resolves after the specified delay.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for the initial assistant response to appear and finish thinking.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {number} [timeout=30000] - Maximum time to wait for the response (ms).
 * @returns {Promise<void>} Resolves when the initial response is ready.
 */
async function waitForInitialResponse(page, timeout = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const assistantMessages = await page.$$('[data-message-author-role="assistant"]');
    const currentMessageCount = assistantMessages.length;
    if (currentMessageCount > messageCount) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const isThinking = await lastMessage.$('.result-thinking');
      if (!isThinking) {
        lastMessageId = await page.evaluate((element) => element.getAttribute('data-message-id'), lastMessage);
        messageCount = currentMessageCount;
        return;
      }
    }
    await sleep(100);
  }
  console.log('Timed out waiting for the initial response.');
}

/**
 * Handles streaming response from the assistant, printing output as it arrives.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} [outputFile] - Path to save the response. Defaults to tmp/response.txt.
 * @returns {Promise<void>} Resolves when streaming is complete.
 */
async function handleStreamingResponse(page, outputFile = path.join(process.cwd(), 'tmp/response.txt')) {
  let previousText = '';
  let completeResponse = '';
  let newContentDetected = false;
  while (!newContentDetected) {
    const assistantMessages = await page.$$('[data-message-author-role="assistant"]');
    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const currentMessageId = await page.evaluate((element) => element.getAttribute('data-message-id'), lastMessage);
      if (currentMessageId === lastMessageId) {
        const currentText = await page.evaluate((element) => element.textContent, lastMessage);
        console.log(`Current text: ${currentText}`);
        if (currentText !== previousText) {
          if (is_streaming) {
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
        lastMessageId = currentMessageId;
      }
    }
    await sleep(100);
  }

  if (!is_streaming) {
    console.log(completeResponse.trim());
    console.log('\n\n');
    fs.ensureDirSync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, completeResponse.trim());
    console.log(`Response saved to ${outputFile}`);
  }
}

/**
 * Checks if the user is logged into ChatGPT by checking if login button exists and is visible.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @returns {Promise<boolean>} True if logged in (no visible login button), false if not logged in.
 */
async function isLoggedIn(page) {
  const result = await page.evaluate(() => {
    const loginButton = document.querySelector('[data-testid="login-button"]');
    // User is NOT logged in if login button exists and is visible
    return !(loginButton && loginButton.offsetParent !== null);
  });

  // Ensure we always return a boolean
  return result === true;
}

/**
 * Handles the login process for ChatGPT by launching a browser and clicking the login button if needed.
 *
 * @returns {Promise<void>} Resolves when the login process is complete.
 */
export async function login() {
  const browser = await createBrowser({ headless: false });
  const page = (await browser.pages()).length > 0 ? (await browser.pages())[0] : await browser.newPage();

  const url = 'https://chat.openai.com';
  const navigate = await navigatePage(page, url);

  // Wait for page to fully load before checking login status
  await navigate.waitForDomIdle(2000, 10000);

  // Check if the login button exists
  const loginButtonExists = await page.evaluate(() => {
    return document.querySelector('[data-testid="login-button"]') !== null;
  });

  if (loginButtonExists) {
    console.log('Login button found, clicking to log in...');
    await page.click('[data-testid="login-button"]');
    // Wait for the login process to complete without requiring full network idleness.
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    try {
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: NETWORK_IDLE_TIMEOUT_MS });
    } catch {
      // Ignore: authentication pages can keep background connections active.
    }
    console.log('Login process completed.');
  } else {
    console.log('No login required - user appears to be already logged in.');
    await browser.close();
  }
}

/**
 * Automates ChatGPT interactions using Puppeteer. Can send text questions or upload files to ChatGPT.
 *
 * @param {Object} [chatgptOptions={}] - Configuration options for ChatGPT automation.
 * @param {boolean} [chatgptOptions.headless=true] - Whether to run the browser in headless mode.
 * @param {string} [chatgptOptions.question] - Text question to send to ChatGPT. Either question or questionFile must be provided.
 * @param {string} [chatgptOptions.questionFile] - Path to a file to upload to ChatGPT. Either question or questionFile must be provided.
 * @param {string} [chatgptOptions.responseFile] - Path to save the response. Defaults to tmp/response.txt.
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
export async function run(options = {}) {
  const {
    headless = true,
    questionFile,
    responseFile = path.join(process.cwd(), 'tmp', 'response.txt'),
    close = true
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

    // Enable temporary chat if available
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

    await sleep(500);

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

    await sleep(1000);

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

export { login as loginChatGpt, run as runChatGpt };
