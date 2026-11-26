import type { Policy } from '../src/policy.js';
import type { Expectation, StepRecord } from '../src/types.js';

export const policy: Policy = {
  version: 1,
  unclassified: 'report',
  categories: {
    necessary: { necessary: true, requests: [], cookies: ['consent'], storage: ['shop:*'] },
    analytics: {
      requests: [
        { origin: 'http://127.0.0.1:4318', path: '/pulse.js' },
        { origin: 'http://127.0.0.1:4318', path: '/collect/analytics' },
      ],
      cookies: ['_pulse_id', '_pulse_session'],
      storage: ['pulse:*'],
    },
    marketing: { requests: [{ path: '/collect/ads' }], cookies: ['_adtag_uid'], storage: [] },
  },
};

export const site = 'http://localhost:3100';

export function step(partial: Partial<StepRecord> & { expect: Expectation }): StepRecord {
  return {
    index: 0,
    label: 'visit',
    action: { kind: 'visit' },
    actionStart: 0,
    actionEnd: 100,
    windowEnd: 1100,
    url: `${site}/`,
    documentLoads: 1,
    requests: [],
    receipts: [],
    cookies: [],
    storage: [],
    otherStorageKeys: 0,
    ...partial,
  };
}
