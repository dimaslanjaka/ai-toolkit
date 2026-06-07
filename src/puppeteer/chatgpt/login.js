import { createBrowser, navigatePage } from '../launcher.js';
import { saveCookies, getCookiePathForUrl } from '../cookies.js';

/**
 * Opens ChatGPT in a visible browser and waits for the user to log in manually.
 * Does NOT auto-click the login button — you must complete login yourself.
 *
 * @returns {Promise<void>} Resolves when login is detected or the browser is closed.
 */
export default async function login() {
  const browser = await createBrowser({ headless: false });
  const page = (await browser.pages()).length > 0 ? (await browser.pages())[0] : await browser.newPage();

  const url = 'https://chat.openai.com';
  const navigate = await navigatePage(page, url);

  // Wait for initial page load
  await navigate.waitForDomIdle(2000, 10000);

  // Check current login state
  const alreadyLoggedIn = await page.evaluate(() => {
    const hasChatInput = !!document.querySelector(
      'textarea[placeholder*="Message"], textarea#prompt-textarea, [contenteditable="true"][data-placeholder*="Message"]'
    );
    const loginButton = document.querySelector('[data-testid="login-button"]');
    return hasChatInput || !loginButton;
  });

  if (alreadyLoggedIn) {
    console.log('Already logged in.');
    await saveCookies(page, getCookiePathForUrl(url));
    await browser.close();
    return;
  }

  console.log('');
  console.log('Please log in to ChatGPT in the opened browser window.');
  console.log('Complete the login manually — this script will detect when you are logged in.');
  console.log('');

  // Poll until login button disappears (user completed login) or chat input appears
  const pollIntervalMs = 2000;
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes timeout
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const loggedIn = await page.evaluate(() => {
      const hasChatInput = !!document.querySelector(
        'textarea[placeholder*="Message"], textarea#prompt-textarea, [contenteditable="true"][data-placeholder*="Message"]'
      );
      const loginButton = document.querySelector('[data-testid="login-button"]');
      return hasChatInput || !loginButton;
    });

    if (loggedIn) {
      console.log('Login detected. Continuing...');
      await saveCookies(page, getCookiePathForUrl(url));
      await browser.close();
      return;
    }

    // Check if browser was closed by the user
    try {
      await page.evaluate(() => document.title);
    } catch {
      console.log('Browser was closed. Aborting login.');
      return;
    }
  }

  console.log('Login timeout reached (5 minutes). Please try again.');
  await browser.close();
}

export { login as loginChatGpt };
