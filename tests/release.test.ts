// The release checks, end to end: real collector, production shop build, the CLI as a user runs
// it, Chromium and Firefox. Build first: pnpm build. Takes a few minutes.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: plain ESM helper without type declarations
import { root, runHarness, startCollector, startShop } from '../scripts/fixture.mjs';
import type { Report } from '../packages/harness/src/types.js';

const browsers = ['--browser', 'chromium,firefox'];
let collector: { stop(): Promise<void> };
let port = 3210;

beforeAll(async () => {
  collector = await startCollector();
});
afterAll(async () => {
  await collector?.stop();
});

async function run(defect: string | null, args: string[] = browsers): Promise<{ code: number; output: string; report: Report }> {
  const shop = await startShop({ defect, port: port++ });
  try {
    const out = await mkdtemp(join(tmpdir(), 'consent-lab-'));
    const { code, output } = await runHarness({ shopURL: shop.url, out, args });
    const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8')) as Report;
    return { code, output, report };
  } finally {
    await shop.stop();
  }
}

const first = (report: Report, browser: string, scenario: string) =>
  report.results.find((r) => r.browser === browser && r.scenario === scenario)!.firstViolation;

describe('the clean shop', () => {
  it('passes every scenario in Chromium and Firefox and exits 0', async () => {
    const { code, report, output } = await run(null);
    expect(code, output).toBe(0);
    expect(report.verdict).toBe('pass');
    expect(report.results).toHaveLength(12);
    expect(report.results.every((r) => r.status === 'pass')).toBe(true);
  });
});

// Each defect is one marked branch in fixtures/shop. Each must fail the assertion it was written
// to trip, in both browsers, and make the CLI exit 1.
describe.each([
  { defect: 'early-pageview', scenario: 'fresh-visit', step: 0, rule: 'request-attempted' },
  { defect: 'cookie-after-revoke', scenario: 'revoke', step: 2, rule: 'cookie-present' },
  { defect: 'reinit-on-navigation', scenario: 'client-side-navigation', step: 3, rule: 'request-attempted' },
])('defect $defect', ({ defect, scenario, step, rule }) => {
  it(`fails ${scenario} at step ${step + 1} with ${rule} and exits 1`, async () => {
    const { code, report, output } = await run(defect);
    expect(code, output).toBe(1);
    for (const browser of ['chromium', 'firefox']) {
      const violation = first(report, browser, scenario);
      expect(violation, `${browser} ${scenario}`).not.toBeNull();
      expect(violation!.step).toBe(step);
      expect(violation!.rule).toBe(rule);
      expect(violation!.category).toBe('analytics');
    }
  });
});

describe('repeated runs', () => {
  it('start from fresh state and record the same thing', async () => {
    const a = await run(null, ['--browser', 'chromium']);
    const b = await run(null, ['--browser', 'chromium']);
    const shape = (r: Report) =>
      r.results.map((x) => ({
        scenario: x.scenario,
        status: x.status,
        initialCookies: x.initialState.cookies,
        steps: x.steps.map((s) => ({
          label: s.label,
          optional: s.requests.filter((q) => q.category === 'analytics' || q.category === 'marketing').map((q) => new URL(q.url).pathname),
          received: (s.receipts ?? []).map((q) => q.event),
          cookies: s.cookies.map((c) => c.name).sort(),
          storage: s.storage.map((c) => c.key).sort(),
        })),
      }));
    expect(shape(b.report)).toEqual(shape(a.report));
    for (const r of [...a.report.results, ...b.report.results]) {
      expect(r.initialState.cookies).toBe(0);
      // Nothing carried over: the first visit of every scenario starts without a consent cookie.
      expect(r.steps[0]!.cookies.map((c) => c.name)).not.toContain('consent');
    }
  });
});

describe('a request the policy does not list', () => {
  it('is reported as unclassified, and fails the run only when the policy says so', async () => {
    const reported = await run(null, ['--browser', 'chromium', '--scenario', 'reject']);
    expect(reported.code).toBe(0);
    expect(reported.report.unclassified.map((u) => u.url)).toEqual(['http://127.0.0.1:4318/widget/stock.json']);

    const strict = JSON.parse(await readFile(join(root, 'fixtures/shop/consent-lab/policy.json'), 'utf8'));
    strict.unclassified = 'fail';
    const policy = join(await mkdtemp(join(tmpdir(), 'consent-lab-policy-')), 'strict.json');
    await writeFile(policy, JSON.stringify(strict));
    const failed = await run(null, ['--browser', 'chromium', '--scenario', 'reject', '--policy', policy]);
    expect(failed.code).toBe(1);
    const violation = first(failed.report, 'chromium', 'reject')!;
    expect(violation.rule).toBe('unclassified-request');
    expect(violation.stepLabel).toBe('navigate in the app');
  });
});
