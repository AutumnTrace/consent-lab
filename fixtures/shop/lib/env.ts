import type { Defect } from './trackers';

// Read per request, so one build serves the clean shop and every defect.
export function collectorOrigin(): string {
  return process.env.COLLECTOR_ORIGIN ?? 'http://127.0.0.1:4318';
}

export function defect(): Defect {
  const value = process.env.SHOP_DEFECT ?? '';
  return value === 'early-pageview' || value === 'cookie-after-revoke' || value === 'reinit-on-navigation' ? value : null;
}
