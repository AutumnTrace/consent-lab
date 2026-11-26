import type { Page } from 'playwright';
import type { Classification, Policy } from './policy.js';

// How to drive one site's consent UI. Three primitives; the harness composes them.
// accept and revoke are called right after openPreferences and must leave the choice saved
// and the preferences UI closed.
export interface ConsentAdapter {
  name: string;
  openPreferences(page: Page): Promise<void>;
  accept(page: Page, category: string): Promise<void>;
  revoke(page: Page, category: string): Promise<void>;
}

export type BrowserName = 'chromium' | 'firefox' | 'webkit';

export interface ConsentLabConfig {
  // Where the site under test runs.
  baseURL: string;
  // Page the scenarios start on. Default "/".
  startPath?: string;
  // An in-app link for the client-side navigation step: its accessible name, and the path it
  // leads to. The harness checks the step loads no new document.
  navigation: { link: string; path: string };
  adapter: ConsentAdapter;
  // A policy object, or a path to a policy JSON file relative to the config file.
  policy: string | Policy;
  // The category whose accept/revoke the scenarios exercise. Default "analytics".
  category?: string;
  // The fake collector, if any. With it the report shows events received, not just attempted.
  collector?: { url: string };
  // How long to keep watching after each action. Default 1000 ms.
  observationWindowMs?: number;
  browsers?: BrowserName[];
  scenarios?: ScenarioId[];
}

export type ScenarioId = 'fresh-visit' | 'reject' | 'accept' | 'revoke' | 'client-side-navigation' | 'full-reload';

export type Action =
  | { kind: 'visit' }
  | { kind: 'accept'; category: string }
  | { kind: 'revoke'; category: string }
  | { kind: 'reject-all' }
  | { kind: 'navigate' }
  | { kind: 'reload' };

export interface Expectation {
  // Optional categories that must show no activity in this step.
  forbidden: string[];
  // Categories that must show activity in this step (a positive control).
  required: string[];
  // Where the forbidden window starts. Navigations count from the start of the action; consent
  // changes count from when the adapter returns, so an event fired by the click itself is not
  // held against the revocation.
  from: 'action-start' | 'action-end';
}

export interface Step {
  label: string;
  action: Action;
  expect: Expectation;
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  question: string;
  steps: Step[];
}

export interface RequestRecord {
  t: number; // ms since the scenario started
  url: string;
  method: string;
  resourceType: string;
  category: Classification;
  outcome: 'completed' | 'failed' | 'pending';
  status?: number;
  failure?: string;
}

export interface ReceiptRecord {
  seq: number;
  t: number; // ms since the scenario started, by the collector's clock (same machine)
  path: string;
  event: string | null;
  page: string | null;
  category: Classification;
}

export interface CookieRecord {
  name: string;
  domain: string;
  category: Classification;
}

export interface StorageRecord {
  key: string;
  category: Classification;
}

export interface StepRecord {
  index: number;
  label: string;
  action: Action;
  expect: Expectation;
  actionStart: number;
  actionEnd: number;
  windowEnd: number;
  url: string;
  documentLoads: number;
  requests: RequestRecord[];
  receipts: ReceiptRecord[] | null; // null without a collector
  cookies: CookieRecord[];
  storage: StorageRecord[];
  otherStorageKeys: number;
  error?: string;
}

export type Rule =
  | 'request-attempted'
  | 'event-received'
  | 'cookie-present'
  | 'storage-present'
  | 'expected-activity-missing'
  | 'unclassified-request';

export interface Violation {
  step: number;
  stepLabel: string;
  rule: Rule;
  category: string;
  expected: string;
  observed: string;
  evidence: string[];
}

export interface ScenarioResult {
  browser: BrowserName;
  browserVersion: string;
  scenario: ScenarioId;
  title: string;
  question: string;
  status: 'pass' | 'fail' | 'error';
  startedAt: string;
  // Cookies in the new browser context before the first navigation: 0 unless state leaked.
  initialState: { cookies: number };
  steps: StepRecord[];
  violations: Violation[];
  firstViolation: Violation | null;
  error?: string;
}

export interface Report {
  tool: { name: '@autumntrace/consent-lab'; version: string };
  label: string | null;
  startedAt: string;
  finishedAt: string;
  target: { baseURL: string; startPath: string; adapter: string; navigation: { link: string; path: string } };
  policy: { source: string; sha256: string; unclassified: 'report' | 'fail'; categoryUnderTest: string; optional: string[] };
  observation: { windowMs: number; collector: string | null; surfaces: string[] };
  results: ScenarioResult[];
  unclassified: { url: string; firstSeen: { browser: BrowserName; scenario: ScenarioId; step: number } }[];
  summary: { runs: number; passed: number; failed: number; errors: number; violations: number; unclassified: number };
  verdict: 'pass' | 'fail' | 'error';
}
