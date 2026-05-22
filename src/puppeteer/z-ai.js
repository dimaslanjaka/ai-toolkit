import fs from 'fs-extra';
import { delay, isEmpty } from 'sbg-utility';
import path from 'upath';
import { getCookiePathForUrl, saveCookies } from './cookies.js';
import { createBrowser, navigatePage } from './launcher.js';

const MAX_INLINE_QUESTION_FILE_BYTES = 2 * 1024;
const ZAI_URL = 'https://chat.z.ai';

async function writeQuestion(page, question) {
  const textarea = await page.waitForSelector('#chat-input', { timeout: 30000 }).catch(() => null);
  if (!textarea) {
    console.log('Cannot find the prompt input on the webpage.');
    return;
  }

  await page.evaluate((text) => {
    const el = document.querySelector('#chat-input');
    if (!el) return;
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, question);

  const hasText = await page.evaluate(() => {
    const el = document.querySelector('#chat-input');
    return Boolean(el && el.value && el.value.trim().length > 0);
  });

  if (!hasText) {
    console.log('Prompt state not updated by DOM injection. Falling back to keyboard insertText.');
    await textarea.click({ clickCount: 1 });
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.insertText(question);
  }
}

async function clickSubmitButton(page) {
  console.log('Attempting to click the submit button...');
  try {
    const userMessageCountBefore = await page.$$eval('div.flex.justify-end.pb-1', (elements) => elements.length);

    const waitForSubmit = async (timeout = 5000) => {
      try {
        await page.waitForFunction(
          (previousCount) => {
            const currentCount = document.querySelectorAll('div.flex.justify-end.pb-1').length;
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
            document.querySelector('#send-message-button'),
            document.querySelector('button[type="submit"]'),
            document.querySelector('[aria-label="Send Message"]')
          ].filter(Boolean);

          return candidates.some((button) => {
            const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
            const isVisible = button.offsetParent !== null;
            return !isDisabled && isVisible;
          });
        },
        { timeout: 5000 }
      )
      .catch(() => {});

    const buttonDetails = await page.evaluate(() => {
      const selectors = ['#send-message-button', 'button[type="submit"]', '[aria-label="Send Message"]'];

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

      const forcedClickWorked = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;
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
    await page.focus('#chat-input');
    await page.keyboard.press('Enter');
    if (await waitForSubmit(5000)) {
      console.log('Submission detected after Enter key fallback.');
      return true;
    }

    const didRequestSubmit = await page.evaluate(() => {
      const prompt = document.querySelector('#chat-input');
      if (!prompt) return false;
      const form = prompt.closest('form');
      if (!form) return false;
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

let messageCount = 0;

async function waitForInitialResponse(page, timeout = 30000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const assistantMessages = await page.$$('.chat-assistant');
    const currentMessageCount = assistantMessages.length;
    if (currentMessageCount > messageCount) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const hasDots = await lastMessage.$('#response-content-container .dot');
      if (!hasDots) {
        messageCount = currentMessageCount;
        return;
      }
    }
    await delay(100);
  }
  console.log('Timed out waiting for the initial response.');
}

async function handleStreamingResponse(page, outputFile = path.join(process.cwd(), 'tmp/response.txt')) {
  const STABILITY_TIMEOUT = 1500;
  const MAX_TIMEOUT = 120000;
  let stableText = '';
  let lastChangeTime = Date.now();
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_TIMEOUT) {
    const assistantMessages = await page.$$('.chat-assistant');
    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const currentText = await page.evaluate((element) => {
        const prose = element.querySelector('#response-content-container .markdown-prose');
        if (!prose) return element.textContent;
        const clone = prose.cloneNode(true);
        clone.querySelector('.thinking-chain-container')?.remove();
        const hiddenThinking = clone.querySelector('.overflow-hidden');
        if (hiddenThinking) hiddenThinking.remove();
        return clone.textContent.trim();
      }, lastMessage);
      if (!isEmpty(currentText)) {
        console.log(`Current text: ${currentText}`);
        if (currentText !== stableText) {
          stableText = currentText;
          lastChangeTime = Date.now();
        } else if (Date.now() - lastChangeTime >= STABILITY_TIMEOUT) {
          break;
        }
      }
    }
    await delay(200);
  }

  const finalText = stableText.trim();
  console.log('='.repeat(20) + ' Final Response ' + '='.repeat(20));
  console.log(finalText);
  console.log('\n\n');
  fs.ensureDirSync(path.dirname(outputFile));
  fs.writeFileSync(outputFile, finalText);
  console.log(`Response saved to ${outputFile}`);
}

export async function isLoggedIn(page) {
  await page
    .waitForSelector('button[type="button"]', {
      timeout: 10000
    })
    .catch(() => {});

  const signInExists = await page.$$eval('button[type="button"]', (buttons) => {
    return buttons.some((btn) => {
      const text = btn.innerText?.trim() || '';
      const visible = !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length);
      return visible && !btn.disabled && /sign\s*in/i.test(text);
    });
  });

  return !signInExists;
}

export async function login() {
  const browser = await createBrowser({ headless: false });
  const page = (await browser.pages()).length > 0 ? (await browser.pages())[0] : await browser.newPage();

  const url = 'https://chat.z.ai';
  const navigate = await navigatePage(page, url);

  await navigate.waitForDomIdle(2000, 10000);

  const loggedIn = await isLoggedIn(page);

  if (loggedIn) {
    console.log('Already logged in to Z-AI. No action needed.');
    await browser.close();
    return true;
  }

  console.log('Sign-in button found. Please log in to Z-AI in the opened browser window.');

  const buttons = await page.$$('button[type="button"]');

  for (const button of buttons) {
    const match = await button.evaluate((el) => {
      const text = el.innerText?.trim() || '';
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return visible && !el.disabled && /sign\s*in/i.test(text);
    });

    if (match) {
      await button.click();
      console.log('Clicked Sign in button');
      break;
    }
  }

  console.log('Waiting for successful login...');

  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll('button[type="button"]')];
    return !buttons.some((btn) => {
      const text = btn.innerText?.trim() || '';
      const visible = !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length);
      return visible && !btn.disabled && /sign\s*in/i.test(text);
    });
  });

  console.log('Login successful.');

  return {
    browser,
    page
  };
}

export async function run(options = {}) {
  const {
    headless = true,
    questionFile,
    responseFile = path.join(process.cwd(), 'tmp', 'response.txt'),
    close = true
  } = options;

  let { question } = options;

  if ((!question && !questionFile) || (question && !question.trim()) || (questionFile && !questionFile.trim())) {
    throw new Error('You must provide a question or a question file.');
  }

  let uploadFile = Boolean(questionFile);

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

    const pages = await browser.pages();
    await Promise.all(pages.filter((p) => p !== page).map((p) => p.close()));

    const navigate = await navigatePage(page, ZAI_URL);
    await navigate.waitForDomIdle(2000, 15000);

    // Save current assistant message count so waitForInitialResponse
    // only detects NEW responses, not pre-existing ones
    messageCount = await page.$$eval('.chat-assistant', (els) => els.length);

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
      await saveCookies(page, getCookiePathForUrl(ZAI_URL));

      return;
    }

    // File upload flow
    if (!uploadFile || !questionFile) {
      return;
    }

    const loggedIn = await isLoggedIn(page);
    console.log(`Login status: ${loggedIn ? 'Logged in' : 'Not logged in'}`);

    if (!loggedIn) {
      console.log('Please log in to Z-AI in the opened browser window.');
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
    console.error('Error running Z-AI:', error);
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

export { login as loginZAI, run as runZAI };
