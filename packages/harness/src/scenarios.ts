import type { Action, Expectation, Scenario, ScenarioId, Step } from './types.js';

// The six scenarios. `category` is the one under test (accepted, then revoked); `optional` is
// every category the policy does not mark necessary.
export function buildScenarios(category: string, optional: string[]): Scenario[] {
  const others = optional.filter((c) => c !== category);
  const none = (from: Expectation['from']): Expectation => ({ forbidden: optional, required: [], from });
  const only = (from: Expectation['from']): Expectation => ({ forbidden: others, required: [category], from });
  const step = (label: string, action: Action, expect: Expectation): Step => ({ label, action, expect });

  const visit = step('visit', { kind: 'visit' }, none('action-start'));
  const accept = step(`accept ${category}`, { kind: 'accept', category }, only('action-end'));
  const revoke = step(`revoke ${category}`, { kind: 'revoke', category }, none('action-end'));

  return [
    {
      id: 'fresh-visit',
      title: 'Fresh visit',
      question: 'Before the visitor chooses anything, does any optional tracker run?',
      steps: [visit],
    },
    {
      id: 'reject',
      title: 'Reject',
      question: 'After "reject", does anything optional start on this page, the next one, or a reload?',
      steps: [
        visit,
        step('reject all', { kind: 'reject-all' }, none('action-end')),
        step('navigate in the app', { kind: 'navigate' }, none('action-start')),
        step('reload', { kind: 'reload' }, none('action-start')),
      ],
    },
    {
      id: 'accept',
      title: 'Accept',
      question: `Does ${category} start only after it is accepted, and keep working across a client-side navigation?`,
      steps: [visit, accept, step('navigate in the app', { kind: 'navigate' }, only('action-start'))],
    },
    {
      id: 'revoke',
      title: 'Revoke',
      question: `After ${category} is revoked, do its requests stop and its cookies and storage go?`,
      steps: [visit, accept, revoke],
    },
    {
      id: 'client-side-navigation',
      title: 'Revoke, then navigate',
      question: `After revoking ${category}, does a client-side navigation bring the tracker back?`,
      steps: [visit, accept, revoke, step('navigate in the app', { kind: 'navigate' }, none('action-start'))],
    },
    {
      id: 'full-reload',
      title: 'Revoke, then reload',
      question: `After revoking ${category}, does a full reload bring the tracker back?`,
      steps: [visit, accept, revoke, step('reload', { kind: 'reload' }, none('action-start'))],
    },
  ];
}

export const scenarioIds: ScenarioId[] = ['fresh-visit', 'reject', 'accept', 'revoke', 'client-side-navigation', 'full-reload'];
