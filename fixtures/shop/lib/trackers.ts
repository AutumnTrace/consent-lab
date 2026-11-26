import { deleteCookie } from './consent-cookie';

// The shop's integration with the two synthetic trackers served by the collector.
// Each defect consent-lab demonstrates is one marked branch in this file or in
// components/consent.tsx, next to the correct code. SHOP_DEFECT selects it.
export type Defect = 'early-pageview' | 'cookie-after-revoke' | 'reinit-on-navigation' | null;

declare global {
  interface Window {
    pulse?: {
      init(options: { site: string }): void;
      pageview(path?: string): void;
      shutdown(): void;
    };
    adtag?: { init(): void; impression(): void; shutdown(): void };
  }
}

const loading = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  let promise = loading.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading.delete(src);
        reject(new Error(`could not load ${src}`));
      };
      document.head.appendChild(script);
    });
    loading.set(src, promise);
  }
  return promise;
}

export async function startAnalytics(collector: string): Promise<void> {
  await loadScript(`${collector}/pulse.js`);
  window.pulse?.init({ site: 'fernway' });
  window.pulse?.pageview(location.pathname);
}

export function stopAnalytics(defect: Defect): void {
  window.pulse?.shutdown();
  localStorage.removeItem('pulse:queue');
  deleteCookie('_pulse_session');
  if (defect === 'cookie-after-revoke') {
    // DEFECT cookie-after-revoke: the client id cookie outlives the revocation.
    return;
  }
  deleteCookie('_pulse_id');
}

export async function startMarketing(collector: string): Promise<void> {
  await loadScript(`${collector}/adtag.js`);
  window.adtag?.init();
}

export function stopMarketing(): void {
  window.adtag?.shutdown();
  deleteCookie('_adtag_uid');
}

export function earlyPageview(collector: string): void {
  // DEFECT early-pageview: a "lightweight" page-view ping sent before any consent check.
  navigator.sendBeacon(
    `${collector}/collect/analytics`,
    JSON.stringify({ event: 'page_view', page: location.pathname, client: null, at: Date.now(), props: { source: 'early-ping' } }),
  );
}
