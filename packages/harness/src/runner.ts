import { createRequire } from 'node:module';
import { type Browser, type BrowserContext, type Page, type Request, chromium, firefox, webkit } from 'playwright';
import { evaluate } from './evaluate.js';
import { type Policy, classifyCookie, classifyRequest, classifyStorageKey, optionalCategories } from './policy.js';
import { buildScenarios } from './scenarios.js';
import type {
  Action,
  BrowserName,
  ConsentAdapter,
  ReceiptRecord,
  Report,
  RequestRecord,
  Scenario,
  ScenarioId,
  ScenarioResult,
  StepRecord,
} from './types.js';

const version: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

export interface RunOptions {
  baseURL: string;
  startPath: string;
  navigation: { link: string; path: string };
  adapter: ConsentAdapter;
  policy: Policy;
  policySource: string;
  policySha256: string;
  category: string;
  collectorURL: string | null;
  windowMs: number;
  browsers: BrowserName[];
  scenarios: ScenarioId[] | null;
  label: string | null;
  log?: (line: string) => void;
}

export const surfaces = [
  'Network requests made by any page or worker in the browser context (attempted, whether or not they completed)',
  'Events received by the collector, when one is configured (received)',
  'Cookies in the browser context, for every domain, at the end of each step',
  'localStorage keys of the page origin at the end of each step, matched against the policy',
];

const launchers = { chromium, firefox, webkit };

export async function runConsentLab(options: RunOptions): Promise<Report> {
  const startedAt = new Date();
  const optional = optionalCategories(options.policy);
  if (!optional.includes(options.category)) {
    throw new Error(`category "${options.category}" is not an optional category in the policy (${optional.join(', ')})`);
  }
  const scenarios = buildScenarios(options.category, optional).filter(
    (s) => options.scenarios === null || options.scenarios.includes(s.id),
  );
  const collector = options.collectorURL ? new CollectorClient(options.collectorURL) : null;
  await collector?.check();

  const results: ScenarioResult[] = [];
  for (const name of options.browsers) {
    const browser = await launchers[name].launch({ headless: true });
    try {
      options.log?.(`${name} ${browser.version()}`);
      for (const scenario of scenarios) {
        const result = await runScenario(browser, name, scenario, options, collector);
        results.push(result);
        options.log?.(describe(result));
      }
    } finally {
      await browser.close();
    }
  }

  const unclassified = new Map<string, Report['unclassified'][number]>();
  for (const r of results) {
    for (const step of r.steps) {
      for (const request of step.requests) {
        if (request.category === 'unclassified' && !unclassified.has(request.url)) {
          unclassified.set(request.url, { url: request.url, firstSeen: { browser: r.browser, scenario: r.scenario, step: step.index } });
        }
      }
    }
  }

  const summary = {
    runs: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    errors: results.filter((r) => r.status === 'error').length,
    violations: results.reduce((n, r) => n + r.violations.length, 0),
    unclassified: unclassified.size,
  };

  return {
    tool: { name: '@autumntrace/consent-lab', version },
    label: options.label,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    target: { baseURL: options.baseURL, startPath: options.startPath, adapter: options.adapter.name, navigation: options.navigation },
    policy: {
      source: options.policySource,
      sha256: options.policySha256,
      unclassified: options.policy.unclassified,
      categoryUnderTest: options.category,
      optional,
    },
    observation: { windowMs: options.windowMs, collector: options.collectorURL, surfaces },
    results,
    unclassified: [...unclassified.values()],
    summary,
    verdict: summary.errors > 0 ? 'error' : summary.failed > 0 ? 'fail' : 'pass',
  };
}

export function describe(r: ScenarioResult): string {
  if (r.status === 'error') return `  ! ${r.scenario}: could not run: ${r.error}`;
  if (r.status === 'pass') return `  ✓ ${r.scenario}`;
  const v = r.firstViolation!;
  return `  ✗ ${r.scenario}: step ${v.step + 1} "${v.stepLabel}": ${v.rule} (${v.category}): ${v.observed}`;
}

async function runScenario(
  browser: Browser,
  name: BrowserName,
  scenario: Scenario,
  options: RunOptions,
  collector: CollectorClient | null,
): Promise<ScenarioResult> {
  // Fresh state for every scenario: a new context (no cookies, no storage) and an empty collector.
  let cursor = (await collector?.reset()) ?? 0;
  const context = await browser.newContext({ baseURL: options.baseURL });
  const startedAt = new Date();
  const t0 = Date.now();
  const site = new URL(options.baseURL).origin;
  // Listeners go on the context before the first page exists, so the first navigation's own
  // requests are recorded too.
  const recorder = new Recorder(context, options.policy, site, t0);
  const initialState = { cookies: (await context.cookies()).length };
  const page = await context.newPage();
  const steps: StepRecord[] = [];
  let error: string | undefined;

  try {
    for (const [index, step] of scenario.steps.entries()) {
      recorder.step = index;
      const actionStart = Date.now() - t0;
      let stepError: string | undefined;
      try {
        await perform(step.action, page, options);
      } catch (e) {
        stepError = e instanceof Error ? e.message.split('\n')[0] : String(e);
      }
      const actionEnd = Date.now() - t0;
      await page.waitForTimeout(options.windowMs);
      const windowEnd = Date.now() - t0;

      const cookies = (await context.cookies()).map((c) => ({
        name: c.name,
        domain: c.domain,
        category: classifyCookie(options.policy, c.name),
      }));
      const keys = await page.evaluate(() => Object.keys(localStorage)).catch(() => [] as string[]);
      const storage = keys
        .map((key) => ({ key, category: classifyStorageKey(options.policy, key) }))
        .filter((s) => s.category !== 'unclassified');
      let receipts: ReceiptRecord[] | null = null;
      if (collector) {
        const batch = await collector.after(cursor);
        cursor = batch.seq;
        receipts = batch.receipts.map((r) => ({
          seq: r.seq,
          t: r.receivedAt - t0,
          path: r.path,
          event: r.event,
          page: r.page,
          category: classifyRequest(options.policy, new URL(r.path, collector.origin).href, site),
        }));
      }
      const requests = recorder.forStep(index);
      const documentLoads = requests.filter((r) => r.resourceType === 'document' && r.url.startsWith(site)).length;
      if (step.action.kind === 'navigate' && documentLoads > 0 && !stepError) {
        stepError = 'the navigation step loaded a new document, so it was not a client-side navigation';
      }

      steps.push({
        index,
        label: step.label,
        action: step.action,
        expect: step.expect,
        actionStart,
        actionEnd,
        windowEnd,
        url: page.url(),
        documentLoads,
        requests,
        receipts,
        cookies,
        storage,
        otherStorageKeys: keys.length - storage.length,
        ...(stepError ? { error: stepError } : {}),
      });
      if (stepError) {
        error = `step ${index + 1} "${step.label}": ${stepError}`;
        break;
      }
    }
  } finally {
    await context.close();
  }

  const violations = error ? [] : evaluate(steps, options.policy, options.windowMs);
  return {
    browser: name,
    browserVersion: browser.version(),
    scenario: scenario.id,
    title: scenario.title,
    question: scenario.question,
    status: error ? 'error' : violations.length > 0 ? 'fail' : 'pass',
    startedAt: startedAt.toISOString(),
    initialState,
    steps,
    violations,
    firstViolation: violations[0] ?? null,
    ...(error ? { error } : {}),
  };
}

async function perform(action: Action, page: Page, options: RunOptions): Promise<void> {
  switch (action.kind) {
    case 'visit':
      await page.goto(options.startPath, { waitUntil: 'load' });
      return;
    case 'reload':
      await page.reload({ waitUntil: 'load' });
      return;
    case 'navigate':
      await page.getByRole('link', { name: options.navigation.link, exact: true }).first().click();
      await page.waitForURL((url) => url.pathname === options.navigation.path);
      return;
    case 'accept':
      await options.adapter.openPreferences(page);
      await options.adapter.accept(page, action.category);
      return;
    case 'revoke':
      await options.adapter.openPreferences(page);
      await options.adapter.revoke(page, action.category);
      return;
    case 'reject-all':
      for (const category of optionalCategories(options.policy)) {
        await options.adapter.openPreferences(page);
        await options.adapter.revoke(page, category);
      }
      return;
  }
}

class Recorder {
  step = 0;
  private readonly records: { step: number; record: RequestRecord }[] = [];
  private readonly byRequest = new WeakMap<Request, RequestRecord>();

  constructor(context: BrowserContext, policy: Policy, site: string, t0: number) {
    context.on('request', (request) => {
      const record: RequestRecord = {
        t: Date.now() - t0,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        category: classifyRequest(policy, request.url(), site),
        outcome: 'pending',
      };
      this.byRequest.set(request, record);
      this.records.push({ step: this.step, record });
    });
    context.on('requestfinished', (request) => {
      const record = this.byRequest.get(request);
      if (!record) return;
      record.outcome = 'completed';
      void request.response().then((r) => {
        if (r) record.status = r.status();
      }).catch(() => undefined);
    });
    context.on('requestfailed', (request) => {
      const record = this.byRequest.get(request);
      if (!record) return;
      record.outcome = 'failed';
      record.failure = request.failure()?.errorText;
    });
  }

  forStep(step: number): RequestRecord[] {
    return this.records.filter((r) => r.step === step).map((r) => r.record);
  }
}

interface RawReceipt {
  seq: number;
  receivedAt: number;
  path: string;
  event: string | null;
  page: string | null;
}

class CollectorClient {
  readonly origin: string;

  constructor(url: string) {
    this.origin = new URL(url).origin;
  }

  async check(): Promise<void> {
    try {
      await this.after(0);
    } catch (e) {
      throw new Error(`collector at ${this.origin} is not answering (${e instanceof Error ? e.message : e})`);
    }
  }

  async reset(): Promise<number> {
    const r = await fetch(`${this.origin}/__reset`, { method: 'POST' });
    if (!r.ok) throw new Error(`collector reset failed: ${r.status}`);
    return (await this.after(0)).seq;
  }

  async after(seq: number): Promise<{ seq: number; receipts: RawReceipt[] }> {
    const r = await fetch(`${this.origin}/__receipts?after=${seq}`);
    if (!r.ok) throw new Error(`collector answered ${r.status}`);
    return (await r.json()) as { seq: number; receipts: RawReceipt[] };
  }
}
