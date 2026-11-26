// One command for the README walkthrough:
//
//   pnpm demo                                  the clean shop, Chromium and Firefox
//   pnpm demo --defect cookie-after-revoke     the same run against a broken shop
//   (also --browser chromium,firefox  --scenario revoke,reject  --out dir)
//
// Starts the collector and a production shop with the chosen defect, runs consent-lab, prints
// where the report is, and exits with the harness's exit code.
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { defects, root, runHarness, startCollector, startShop } from './fixture.mjs';

const { values } = parseArgs({
  options: { defect: { type: 'string' }, browser: { type: 'string' }, scenario: { type: 'string' }, out: { type: 'string' } },
});
if (values.defect && !defects.includes(values.defect)) {
  console.error(`unknown defect "${values.defect}"; choose from ${defects.join(', ')}`);
  process.exit(2);
}

const out = values.out ?? join(root, 'reports', 'latest');
const collector = await startCollector();
const shop = await startShop({ defect: values.defect ?? null });
let code = 2;
try {
  console.log(`shop ${shop.url} (${values.defect ? `defect: ${values.defect}` : 'no defect'}), collector ${collector.url}`);
  const result = await runHarness({
    shopURL: shop.url,
    out,
    label: values.defect ? `defect: ${values.defect}` : 'clean shop',
    args: [
      ...(values.browser ? ['--browser', values.browser] : []),
      ...(values.scenario ? ['--scenario', values.scenario] : []),
    ],
  });
  process.stdout.write(result.output);
  code = result.code ?? 2;
} finally {
  await shop.stop();
  await collector.stop();
}
process.exit(code);
