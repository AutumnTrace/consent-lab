'use client';

import { useEffect, useState } from 'react';

// A third-party request the shop's consent policy deliberately does not list, so consent-lab
// reports it as unclassified.
export function StockWidget({ collector }: { collector: string }) {
  const [low, setLow] = useState<string[] | null>(null);
  useEffect(() => {
    fetch(`${collector}/widget/stock.json`)
      .then((r) => r.json())
      .then((d: { lowStock: string[] }) => setLow(d.lowStock))
      .catch(() => setLow([]));
  }, [collector]);
  if (!low || low.length === 0) return null;
  return <p className="stock">Running low: {low.join(', ')}</p>;
}
