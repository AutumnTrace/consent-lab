// Regenerates the committed sample reports in reports/: the clean shop and each defect, in
// Chromium and Firefox. Build first (pnpm build). Prints each run's exit code.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { defects, root, runHarness, startCollector, startShop } from './fixture.mjs';

const collector = await startCollector();
let port = 3250;
try {
  for (const defect of [null, ...defects]) {
    const name = defect ?? 'clean';
    const out = join(root, 'reports', name);
    await rm(out, { recursive: true, force: true });
    const shop = await startShop({ defect, port: port++ });
    try {
      const { code, output } = await runHarness({
        shopURL: shop.url,
        out,
        label: defect ? `defect: ${defect}` : 'clean shop',
        args: ['--browser', 'chromium,firefox'],
      });
      const summary = output.trim().split('\n').at(-2);
      console.log(`${name.padEnd(22)} exit ${code}  ${summary}`);
    } finally {
      await shop.stop();
    }
  }
} finally {
  await collector.stop();
}
