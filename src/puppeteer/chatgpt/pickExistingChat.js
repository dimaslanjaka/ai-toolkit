import Fuse from 'fuse.js';
import { waitForDomIdle } from '../launcher.js';

/**
 * Picks an existing chat from the sidebar based on the question.
 * @param {import('puppeteer').Page} page
 * @param {string} question
 */
export async function pickExistingChat(page, question) {
  let isExpanded = false;

  // detect collapsed Recents section
  const collapsedExists = await page.evaluate(() => {
    return [...document.querySelectorAll('button[aria-expanded]')].some((btn) => {
      const text = btn.innerText?.trim() || '';
      const expanded = btn.getAttribute('aria-expanded');

      return text.includes('Recents') && expanded === 'false';
    });
  });

  isExpanded = !collapsedExists;

  if (collapsedExists) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button[aria-expanded]')].find((btn) => {
        const text = btn.innerText?.trim() || '';
        const expanded = btn.getAttribute('aria-expanded');

        return text.includes('Recents') && expanded === 'false';
      });

      if (btn) btn.click();
    });
  }

  // ensure Recents is expanded and visible
  if (!collapsedExists) {
    isExpanded = await page.evaluate(() => {
      return [...document.querySelectorAll('button[aria-expanded]')].some((btn) => {
        const text = btn.innerText?.trim() || '';
        const expanded = btn.getAttribute('aria-expanded');
        const visible = !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length);

        return visible && expanded === 'true' && /recents/i.test(text);
      });
    });
  }

  if (!isExpanded) {
    throw new Error('Could not find or expand the Recents section in the sidebar.');
  }

  const items = await page.$$('#history a[data-sidebar-item="true"]');

  const history = [];

  for (const el of items) {
    const title = await el.evaluate((node) => {
      const span = node.querySelector('span');
      return span?.textContent?.trim() || node.getAttribute('aria-label') || '';
    });

    history.push({ title, element: el });
  }

  if (!history.length) return;

  // fuzzy candidate matcher (semantic + typo tolerant)
  const fuse = new Fuse(history, {
    keys: ['title'],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true
  });

  const results = fuse.search(question);

  if (!results.length) return;

  const best = results[0].item;
  await best.element.click();
  await waitForDomIdle(page, 1000, 10000);
}
