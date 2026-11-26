// The visitor's choice, kept in a first-party cookie the policy lists as necessary:
// consent=analytics:1|marketing:0. No cookie means no choice yet.
export interface Consent {
  analytics: boolean;
  marketing: boolean;
}

export function readConsent(): Consent | null {
  const match = document.cookie.match(/(?:^|; )consent=([^;]*)/);
  if (!match) return null;
  const parts = Object.fromEntries(decodeURIComponent(match[1]).split('|').map((p) => p.split(':')));
  return { analytics: parts.analytics === '1', marketing: parts.marketing === '1' };
}

export function writeConsent(consent: Consent): void {
  const value = encodeURIComponent(`analytics:${consent.analytics ? 1 : 0}|marketing:${consent.marketing ? 1 : 0}`);
  document.cookie = `consent=${value}; path=/; max-age=${180 * 24 * 3600}; SameSite=Lax`;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}
