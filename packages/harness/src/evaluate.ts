import type { Policy } from './policy.js';
import type { Rule, StepRecord, Violation } from './types.js';

const ruleOrder: Rule[] = [
  'request-attempted',
  'event-received',
  'cookie-present',
  'storage-present',
  'expected-activity-missing',
  'unclassified-request',
];

// Turns a recorded timeline into violations. Pure: no browser, no network.
export function evaluate(steps: StepRecord[], policy: Policy, windowMs: number): Violation[] {
  const violations: Violation[] = [];
  for (const step of steps) {
    const from = step.expect.from === 'action-end' ? step.actionEnd : step.actionStart;
    const since = step.expect.from === 'action-end' ? `after "${step.label}" returned` : `from the start of "${step.label}"`;
    const add = (rule: Rule, category: string, expected: string, observed: string, evidence: string[]) =>
      violations.push({ step: step.index, stepLabel: step.label, rule, category, expected, observed, evidence });

    for (const category of step.expect.forbidden) {
      const requests = step.requests.filter((r) => r.category === category && r.t >= from);
      if (requests.length > 0) {
        add(
          'request-attempted',
          category,
          `No ${category} requests ${since}, through the ${windowMs} ms observation window.`,
          `${requests.length} ${category} request${requests.length > 1 ? 's' : ''} attempted.`,
          requests.map((r) => `+${r.t} ms ${r.method} ${r.url} (${r.resourceType}, ${r.outcome}${r.status ? ` ${r.status}` : ''})`),
        );
      }
      const receipts = (step.receipts ?? []).filter((r) => r.category === category && r.t >= from);
      if (receipts.length > 0) {
        add(
          'event-received',
          category,
          `The collector receives no ${category} events ${since}.`,
          `${receipts.length} ${category} event${receipts.length > 1 ? 's' : ''} received.`,
          receipts.map((r) => `+${r.t} ms #${r.seq} ${r.path} ${r.event ?? ''}${r.page ? ` page=${r.page}` : ''}`.trim()),
        );
      }
      const cookies = step.cookies.filter((c) => c.category === category);
      if (cookies.length > 0) {
        add(
          'cookie-present',
          category,
          `No ${category} cookies at the end of "${step.label}".`,
          `${cookies.map((c) => c.name).join(', ')} still set.`,
          cookies.map((c) => `cookie ${c.name} on ${c.domain}`),
        );
      }
      const storage = step.storage.filter((s) => s.category === category);
      if (storage.length > 0) {
        add(
          'storage-present',
          category,
          `No ${category} localStorage keys at the end of "${step.label}".`,
          `${storage.map((s) => s.key).join(', ')} still stored.`,
          storage.map((s) => `localStorage ${s.key}`),
        );
      }
    }

    for (const category of step.expect.required) {
      // Received events when a collector is configured; attempted requests otherwise.
      const seen =
        step.receipts !== null
          ? step.receipts.some((r) => r.category === category && r.t >= from)
          : step.requests.some((r) => r.category === category && r.t >= from);
      if (!seen) {
        add(
          'expected-activity-missing',
          category,
          `At least one ${category} ${step.receipts !== null ? 'event received' : 'request'} ${since}. Without it, the later checks would pass even if the tracker never ran.`,
          `No ${category} activity.`,
          [],
        );
      }
    }
  }

  if (policy.unclassified === 'fail') {
    const seen = new Set<string>();
    for (const step of steps) {
      const fresh = step.requests.filter((r) => {
        if (r.category !== 'unclassified' || seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
      if (fresh.length > 0) {
        violations.push({
          step: step.index,
          stepLabel: step.label,
          rule: 'unclassified-request',
          category: 'unclassified',
          expected: 'Every request to another origin is listed under a category (policy.unclassified is "fail").',
          observed: `${fresh.length} unclassified request${fresh.length > 1 ? 's' : ''}.`,
          evidence: fresh.map((r) => `+${r.t} ms ${r.method} ${r.url}`),
        });
      }
    }
  }

  return violations.sort((a, b) => a.step - b.step || ruleOrder.indexOf(a.rule) - ruleOrder.indexOf(b.rule));
}
