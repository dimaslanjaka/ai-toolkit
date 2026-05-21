import { createBrowser, navigatePage } from './launcher.js';

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

  // Wait for page to fully load
  await navigate.waitForDomIdle(2000, 10000);

  // Check login status
  const loggedIn = await isLoggedIn(page);

  // Already logged in
  if (loggedIn) {
    console.log('Already logged in to Z-AI. No action needed.');

    await browser.close();

    return true;
  }

  console.log('Sign-in button found. Please log in to Z-AI in the opened browser window.');

  // Find and click Sign in button
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

  // Wait until user successfully logs in
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
