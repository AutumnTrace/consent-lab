import type { Metadata } from 'next';
import Link from 'next/link';
import { ReactNode } from 'react';
import { ConsentProvider, PreferencesButton } from '@/components/consent';
import { collectorOrigin, defect } from '@/lib/env';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fernway Supply (consent-lab fixture)',
  description: 'A fictional shop used to test consent behaviour.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const current = defect();
  return (
    <html lang="en">
      <body data-defect={current ?? 'none'}>
        <ConsentProvider collector={collectorOrigin()} defect={current}>
          <header className="top">
            <Link href="/" className="brand">
              Fernway Supply
            </Link>
            <nav aria-label="Main">
              <Link href="/">Home</Link>
              <Link href="/products">Products</Link>
              <Link href="/about">About</Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer>
            <span>A fictional shop: the fixture for consent-lab.</span>
            <PreferencesButton />
          </footer>
        </ConsentProvider>
      </body>
    </html>
  );
}
