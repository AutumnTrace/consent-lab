import type { ConsentAdapter, Page } from '@autumntrace/consent-lab';

// How consent-lab drives this shop's consent UI. The banner shows on a first visit; after a
// choice, the footer's "Cookie preferences" button reopens the same dialog.
const labels: Record<string, RegExp> = { analytics: /^Analytics/, marketing: /^Marketing/ };

async function setCategory(page: Page, category: string, on: boolean): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Cookie preferences' });
  const label = labels[category];
  if (!label) throw new Error(`the shop has no "${category}" category`);
  await dialog.getByRole('checkbox', { name: label }).setChecked(on);
  await dialog.getByRole('button', { name: 'Save choices' }).click();
  await dialog.waitFor({ state: 'detached' });
}

export const shopAdapter: ConsentAdapter = {
  name: 'Fernway Supply banner and preferences dialog',

  async openPreferences(page) {
    const banner = page.getByRole('region', { name: 'Cookie consent' });
    const fromBanner = banner.getByRole('button', { name: 'Preferences' });
    const fromFooter = page.getByRole('button', { name: 'Cookie preferences' });
    await fromBanner.or(fromFooter).first().waitFor();
    if (await fromBanner.isVisible()) await fromBanner.click();
    else await fromFooter.click();
    await page.getByRole('dialog', { name: 'Cookie preferences' }).waitFor();
  },

  accept: (page, category) => setCategory(page, category, true),
  revoke: (page, category) => setCategory(page, category, false),
};
