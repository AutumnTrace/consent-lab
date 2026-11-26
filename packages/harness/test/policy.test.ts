import { describe, expect, it } from 'vitest';
import { classifyCookie, classifyRequest, classifyStorageKey, optionalCategories, validatePolicy } from '../src/policy.js';
import { policy, site } from './fixtures.js';

describe('classifyRequest', () => {
  it('matches a category by origin and path', () => {
    expect(classifyRequest(policy, 'http://127.0.0.1:4318/pulse.js', site)).toBe('analytics');
    expect(classifyRequest(policy, 'http://127.0.0.1:4318/collect/analytics', site)).toBe('analytics');
  });

  it('matches a rule with no origin on any origin', () => {
    expect(classifyRequest(policy, 'https://ads.example/collect/ads?x=1', site)).toBe('marketing');
  });

  it('treats unlisted requests to the site itself as first-party', () => {
    expect(classifyRequest(policy, `${site}/_next/static/chunk.js`, site)).toBe('first-party');
  });

  it('reports anything else as unclassified', () => {
    expect(classifyRequest(policy, 'http://127.0.0.1:4318/widget/stock.json', site)).toBe('unclassified');
    // Same host, another port: another origin.
    expect(classifyRequest(policy, 'http://localhost:9999/', site)).toBe('unclassified');
  });
});

describe('cookies and storage', () => {
  it('match exact names, or prefixes ending in *', () => {
    expect(classifyCookie(policy, '_pulse_id')).toBe('analytics');
    expect(classifyCookie(policy, '_pulse_idx')).toBe('unclassified');
    expect(classifyStorageKey(policy, 'pulse:queue')).toBe('analytics');
    expect(classifyStorageKey(policy, 'shop:last-visit')).toBe('necessary');
    expect(classifyStorageKey(policy, 'other')).toBe('unclassified');
  });
});

describe('validatePolicy', () => {
  it('lists optional categories', () => {
    expect(optionalCategories(policy)).toEqual(['analytics', 'marketing']);
  });

  it('refuses malformed policies', () => {
    expect(() => validatePolicy({ ...policy, unclassified: 'ignore' as never })).toThrow(/unclassified/);
    expect(() =>
      validatePolicy({ ...policy, categories: { necessary: { necessary: true, requests: [], cookies: [], storage: [] } } }),
    ).toThrow(/no optional category/);
    expect(() =>
      validatePolicy({ ...policy, categories: { analytics: { requests: [], cookies: 'x' as never, storage: [] } } }),
    ).toThrow(/cookies must be an array/);
  });
});
