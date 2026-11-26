import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { renderHtml } from '../src/report/html.js';
import { buildScenarios } from '../src/scenarios.js';
import type { Report, ScenarioResult } from '../src/types.js';
import { policy, site, step } from './fixtures.js';

function report(results: ScenarioResult[]): Report {
  return {
    tool: { name: '@autumntrace/consent-lab', version: '0.1.0' },
    label: 'unit <test>',
    startedAt: '2026-11-26T00:00:00.000Z',
    finishedAt: '2026-11-26T00:00:01.000Z',
    target: { baseURL: site, startPath: '/', adapter: 'test adapter', navigation: { link: 'Products', path: '/products' } },
    policy: { source: 'policy.json', sha256: 'abc123', unclassified: 'report', categoryUnderTest: 'analytics', optional: ['analytics', 'marketing'] },
    observation: { windowMs: 1000, collector: null, surfaces: ['requests'] },
    results,
    unclassified: [],
    summary: { runs: results.length, passed: 0, failed: results.length, errors: 0, violations: 1, unclassified: 0 },
    verdict: 'fail',
  };
}

describe('renderHtml', () => {
  const revoke = step({
    index: 2,
    label: 'revoke analytics',
    expect: { forbidden: ['analytics', 'marketing'], required: [], from: 'action-end' },
    cookies: [{ name: '_pulse_id', domain: 'localhost', category: 'analytics' }],
    // A hostile URL must come out as text.
    requests: [
      {
        t: 500,
        url: 'http://127.0.0.1:4318/x?<script>alert(1)</script>',
        method: 'GET',
        resourceType: 'script',
        category: 'unclassified',
        outcome: 'completed',
      },
    ],
  });
  const violations = evaluate([revoke], policy, 1000);
  const result: ScenarioResult = {
    browser: 'chromium',
    browserVersion: '1.0',
    scenario: 'revoke',
    title: 'Revoke',
    question: 'q',
    status: 'fail',
    startedAt: '2026-11-26T00:00:00.000Z',
    initialState: { cookies: 0 },
    steps: [revoke],
    violations,
    firstViolation: violations[0]!,
  };
  const html = renderHtml(report([result]));

  it('leads a failed run with its first violating action, expectation and evidence', () => {
    expect(html).toContain('First violating action');
    expect(html).toContain('Step 3: revoke analytics');
    expect(html).toContain('No analytics cookies at the end of &quot;revoke analytics&quot;.');
    expect(html).toContain('cookie _pulse_id on localhost');
  });

  it('escapes everything that came from the page or the config', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('unit &lt;test&gt;');
  });

  it('is self-contained: no scripts and no external resources', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
    expect(html).not.toMatch(/<link /i);
  });
});

describe('buildScenarios', () => {
  it('builds the six scenarios, each starting with a visit where nothing optional may run', () => {
    const scenarios = buildScenarios('analytics', ['analytics', 'marketing']);
    expect(scenarios.map((s) => s.id)).toEqual(['fresh-visit', 'reject', 'accept', 'revoke', 'client-side-navigation', 'full-reload']);
    for (const s of scenarios) expect(s.steps[0]!.expect.forbidden).toEqual(['analytics', 'marketing']);
    const accept = scenarios.find((s) => s.id === 'accept')!;
    expect(accept.steps[1]!.expect).toEqual({ forbidden: ['marketing'], required: ['analytics'], from: 'action-end' });
  });
});
