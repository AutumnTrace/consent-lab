import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// What each consent category is allowed to touch, as observed from the browser: request
// origins and paths, cookie names, and localStorage keys. A trailing * makes a prefix match.
export interface Policy {
  version: 1;
  // What to do with a request to another origin that no category lists.
  //   "report": list it in the report as unclassified; the run can still pass.
  //   "fail":   treat it as a violation.
  unclassified: 'report' | 'fail';
  categories: Record<string, CategoryPolicy>;
}

export interface CategoryPolicy {
  description?: string;
  // Necessary categories are never forbidden. Every other category is optional.
  necessary?: boolean;
  requests: { origin?: string; path?: string }[];
  cookies: string[];
  storage: string[];
}

// "first-party": a request to the site's own origin that no category claims. Never forbidden.
// "unclassified": anything else no category claims.
export type Classification = string | 'first-party' | 'unclassified';

export async function loadPolicy(path: string): Promise<{ policy: Policy; sha256: string }> {
  const text = await readFile(path, 'utf8');
  const policy = JSON.parse(text) as Policy;
  validatePolicy(policy);
  return { policy, sha256: createHash('sha256').update(text).digest('hex') };
}

export function validatePolicy(policy: Policy): void {
  if (policy.version !== 1) throw new Error('policy.version must be 1');
  if (policy.unclassified !== 'report' && policy.unclassified !== 'fail') {
    throw new Error('policy.unclassified must be "report" or "fail"');
  }
  for (const [name, category] of Object.entries(policy.categories ?? {})) {
    for (const field of ['requests', 'cookies', 'storage'] as const) {
      if (!Array.isArray(category[field])) throw new Error(`policy.categories.${name}.${field} must be an array`);
    }
  }
  if (optionalCategories(policy).length === 0) throw new Error('policy has no optional category to test');
}

export function optionalCategories(policy: Policy): string[] {
  return Object.entries(policy.categories)
    .filter(([, c]) => !c.necessary)
    .map(([name]) => name);
}

function matches(pattern: string, value: string): boolean {
  return pattern.endsWith('*') ? value.startsWith(pattern.slice(0, -1)) : value === pattern;
}

export function classifyRequest(policy: Policy, url: string, siteOrigin: string): Classification {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'unclassified';
  }
  for (const [name, category] of Object.entries(policy.categories)) {
    for (const rule of category.requests) {
      const originOk = rule.origin === undefined || matches(rule.origin, parsed.origin);
      const pathOk = rule.path === undefined || matches(rule.path, parsed.pathname);
      if (originOk && pathOk) return name;
    }
  }
  if (parsed.origin === siteOrigin) return 'first-party';
  // Inline data: and blob: URLs never leave the browser.
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return 'first-party';
  return 'unclassified';
}

export function classifyCookie(policy: Policy, name: string): Classification {
  for (const [category, c] of Object.entries(policy.categories)) {
    if (c.cookies.some((p) => matches(p, name))) return category;
  }
  return 'unclassified';
}

export function classifyStorageKey(policy: Policy, key: string): Classification {
  for (const [category, c] of Object.entries(policy.categories)) {
    if (c.storage.some((p) => matches(p, key))) return category;
  }
  return 'unclassified';
}
