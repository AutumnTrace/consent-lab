// Screenshots for the README, taken from the committed sample reports and a live shop.
// Run pnpm reports first.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { root, startCollector, startShop } from './fixture.mjs';

const media = join(root, 'docs', 'media');
await mkdir(media, { recursive: true });
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });

  // The README's opening scenario, failing: revoke analytics, navigate, the tracker comes back.
  await page.goto(pathToFileURL(join(root, 'reports', 'reinit-on-navigation', 'report.html')).href);
  const run = page.locator('#chromium-client-side-navigation');
  await run.locator('.violation').first().screenshot({ path: join(media, 'first-violation.png') });
  await run.locator('#s-3').screenshot({ path: join(media, 'step-navigate.png') });

  // The summary matrix of the same report.
  await page.locator('h2', { hasText: 'Scenarios' }).scrollIntoViewIfNeeded();
  const top = await page.locator('h1').boundingBox();
  const table = await page.locator('table').first().boundingBox();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(media, 'report-summary.png'),
    clip: { x: 0, y: top.y - 20, width: 1100, height: table.y + table.height - top.y + 40 },
  });

  // The fixture shop with its banner.
  const collector = await startCollector();
  const shop = await startShop({ port: 3290 });
  try {
    const shopPage = await browser.newPage({ viewport: { width: 1100, height: 640 } });
    await shopPage.goto(shop.url);
    await shopPage.getByRole('region', { name: 'Cookie consent' }).waitFor();
    await shopPage.screenshot({ path: join(media, 'shop.png') });
  } finally {
    await shop.stop();
    await collector.stop();
  }
} finally {
  await browser.close();
}
console.log(`screenshots written to ${media}`);
