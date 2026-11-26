import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import type { RequestRecord } from '../src/types.js';
import { policy, step } from './fixtures.js';

const beacon = (t: number): RequestRecord => ({
  t,
  url: 'http://127.0.0.1:4318/collect/analytics',
  method: 'POST',
  resourceType: 'ping',
  category: 'analytics',
  outcome: 'completed',
  status: 204,
});

const none = (from: 'action-start' | 'action-end') => ({ forbidden: ['analytics', 'marketing'], required: [], from });

describe('evaluate', () => {
  it('passes a step with no optional activity', () => {
    expect(evaluate([step({ expect: none('action-start') })], policy, 1000)).toEqual([]);
  });

  it('flags a forbidden request, the event the collector received, and what it left behind', () => {
    const violations = evaluate(
      [
        step({
          expect: none('action-start'),
          requests: [beacon(40)],
          receipts: [{ seq: 1, t: 42, path: '/collect/analytics', event: 'page_view', page: '/', category: 'analytics' }],
          cookies: [{ name: '_pulse_id', domain: 'localhost', category: 'analytics' }],
          storage: [{ key: 'pulse:queue', category: 'analytics' }],
        }),
      ],
      policy,
      1000,
    );
    expect(violations.map((v) => v.rule)).toEqual(['request-attempted', 'event-received', 'cookie-present', 'storage-present']);
    expect(violations[0]!.evidence[0]).toContain('POST http://127.0.0.1:4318/collect/analytics');
  });

  it('starts the window of a consent change when the adapter returns', () => {
    // A beacon fired by the Save click itself (t < actionEnd) is not held against a revocation.
    const during = step({ label: 'revoke analytics', expect: none('action-end'), actionEnd: 100, requests: [beacon(80)] });
    const after = step({ label: 'revoke analytics', expect: none('action-end'), actionEnd: 100, requests: [beacon(120)] });
    expect(evaluate([during], policy, 1000)).toEqual([]);
    expect(evaluate([after], policy, 1000)).toHaveLength(1);
  });

  it('requires activity for a required category, so a dead tracker cannot pass', () => {
    const accept = { forbidden: ['marketing'], required: ['analytics'], from: 'action-end' as const };
    expect(evaluate([step({ label: 'accept analytics', expect: accept })], policy, 1000).map((v) => v.rule)).toEqual([
      'expected-activity-missing',
    ]);
    const working = step({
      label: 'accept analytics',
      expect: accept,
      receipts: [{ seq: 1, t: 150, path: '/collect/analytics', event: 'page_view', page: '/', category: 'analytics' }],
    });
    expect(evaluate([working], policy, 1000)).toEqual([]);
  });

  it('counts required activity from the start of the action, before the adapter returns', () => {
    // Pulse loaded and sent its first event while the adapter waited for the dialog to close.
    const accept = { forbidden: ['marketing'], required: ['analytics'], from: 'action-end' as const };
    const early = step({
      label: 'accept analytics',
      expect: accept,
      actionStart: 0,
      actionEnd: 300,
      receipts: [{ seq: 1, t: 180, path: '/collect/analytics', event: 'page_view', page: '/', category: 'analytics' }],
    });
    expect(evaluate([early], policy, 1000)).toEqual([]);
  });

  it('falls back to attempted requests when there is no collector', () => {
    const accept = { forbidden: [], required: ['analytics'], from: 'action-end' as const };
    expect(evaluate([step({ expect: accept, receipts: null, requests: [beacon(150)] })], policy, 1000)).toEqual([]);
  });

  it('orders violations by step, so the first one is the first violating action', () => {
    const violations = evaluate(
      [
        step({ index: 0, expect: none('action-start') }),
        step({
          index: 1,
          label: 'revoke analytics',
          expect: none('action-end'),
          cookies: [{ name: '_pulse_id', domain: 'localhost', category: 'analytics' }],
        }),
        step({ index: 2, label: 'navigate in the app', expect: none('action-start'), requests: [beacon(30)] }),
      ],
      policy,
      1000,
    );
    expect(violations.map((v) => [v.step, v.rule])).toEqual([
      [1, 'cookie-present'],
      [2, 'request-attempted'],
    ]);
  });

  it('reports unclassified requests as violations only when the policy says fail', () => {
    const widget: RequestRecord = { ...beacon(10), url: 'http://127.0.0.1:4318/widget/stock.json', category: 'unclassified' };
    const steps = [step({ expect: none('action-start'), requests: [widget, { ...widget, t: 20 }] })];
    expect(evaluate(steps, policy, 1000)).toEqual([]);
    const failing = evaluate(steps, { ...policy, unclassified: 'fail' }, 1000);
    expect(failing.map((v) => v.rule)).toEqual(['unclassified-request']);
    expect(failing[0]!.evidence).toHaveLength(1);
  });
});
