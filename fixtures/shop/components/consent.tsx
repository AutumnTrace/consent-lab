'use client';

import { usePathname } from 'next/navigation';
import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Consent, readConsent, writeConsent } from '@/lib/consent-cookie';
import { Defect, earlyPageview, startAnalytics, startMarketing, stopAnalytics, stopMarketing } from '@/lib/trackers';

interface ConsentApi {
  consent: Consent | null;
  openPreferences(): void;
}

const ConsentContext = createContext<ConsentApi>({ consent: null, openPreferences: () => {} });

export function useConsent(): ConsentApi {
  return useContext(ConsentContext);
}

export function ConsentProvider({ children, collector, defect }: { children: ReactNode; collector: string; defect: Defect }) {
  // undefined until the stored choice has been read on the client; null means no choice yet.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (defect === 'early-pageview') earlyPageview(collector);
    setConsent(readConsent());
    localStorage.setItem('shop:last-visit', new Date().toISOString());
  }, [collector, defect]);

  // Start or stop each tracker whenever the choice changes.
  useEffect(() => {
    if (consent === undefined) return;
    if (consent?.analytics) void startAnalytics(collector);
    else stopAnalytics(defect);
    if (consent?.marketing) void startMarketing(collector);
    else stopMarketing();
  }, [consent, collector, defect]);

  // A page view for each client-side navigation (not the first render).
  useEffect(() => {
    if (lastPath.current === pathname || consent === undefined) return;
    lastPath.current = pathname;
    if (defect === 'reinit-on-navigation') {
      // DEFECT reinit-on-navigation: the route listener starts the tracker without asking.
      void startAnalytics(collector);
      return;
    }
    if (consent?.analytics) window.pulse?.pageview(pathname);
    if (consent?.marketing) window.adtag?.impression();
  }, [pathname, consent, collector, defect]);

  const choose = useCallback((next: Consent) => {
    writeConsent(next);
    setConsent(next);
    setPreferencesOpen(false);
  }, []);

  return (
    <ConsentContext.Provider value={{ consent: consent ?? null, openPreferences: () => setPreferencesOpen(true) }}>
      {children}
      {consent === null && !preferencesOpen && (
        <section className="banner" aria-label="Cookie consent">
          <p>
            We use a necessary cookie to remember this choice. With your permission we also measure visits (analytics) and
            show you our ads elsewhere (marketing).
          </p>
          <div className="banner-actions">
            <button type="button" onClick={() => choose({ analytics: true, marketing: true })}>
              Accept all
            </button>
            <button type="button" onClick={() => choose({ analytics: false, marketing: false })}>
              Reject all
            </button>
            <button type="button" className="link" onClick={() => setPreferencesOpen(true)}>
              Preferences
            </button>
          </div>
        </section>
      )}
      {preferencesOpen && (
        <Preferences current={consent ?? { analytics: false, marketing: false }} onSave={choose} onClose={() => setPreferencesOpen(false)} />
      )}
    </ConsentContext.Provider>
  );
}

function Preferences({ current, onSave, onClose }: { current: Consent; onSave(c: Consent): void; onClose(): void }) {
  const [draft, setDraft] = useState(current);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} aria-label="Cookie preferences" onClose={onClose}>
      <h2>Cookie preferences</h2>
      <label>
        <input type="checkbox" checked disabled /> Necessary <span>Remembers this choice. Always on.</span>
      </label>
      <label>
        <input type="checkbox" checked={draft.analytics} onChange={(e) => setDraft({ ...draft, analytics: e.target.checked })} />{' '}
        Analytics <span>Pulse: page views, to see which pages people use.</span>
      </label>
      <label>
        <input type="checkbox" checked={draft.marketing} onChange={(e) => setDraft({ ...draft, marketing: e.target.checked })} />{' '}
        Marketing <span>Beacon Ads: shows our ads to past visitors.</span>
      </label>
      <div className="banner-actions">
        <button type="button" onClick={() => onSave(draft)}>
          Save choices
        </button>
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export function PreferencesButton() {
  const { openPreferences } = useConsent();
  return (
    <button type="button" className="link" onClick={openPreferences}>
      Cookie preferences
    </button>
  );
}
