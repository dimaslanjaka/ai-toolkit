import { pickExistingChat } from '../../src/puppeteer/chatgpt/pickExistingChat.js';
import { createBrowser, navigatePage } from '../../src/puppeteer/launcher.js';

async function main() {
  const browser = await createBrowser();
  const [existingPage] = await browser.pages();
  const page = existingPage || (await browser.newPage());

  const url = 'https://chat.openai.com/';
  const navigate = await navigatePage(page, url);

  await navigate.waitForDomIdle(2000, 15000);

  await pickExistingChat(page, 'puppeteer');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
