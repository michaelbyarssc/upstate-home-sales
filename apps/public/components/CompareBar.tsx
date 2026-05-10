'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clearCompare, getCompare, subscribeCompare, toggleCompare, type CompareItem } from '../lib/compare-store';

export function CompareBar() {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(getCompare());
    setHydrated(true);
    return subscribeCompare(setItems);
  }, []);

  if (!hydrated || items.length === 0) return null;

  const ids = items.map((i) => encodeURIComponent(i.stock_no)).join(',');

  return (
    <div className="compare-bar" role="region" aria-label="Compare selection">
      <span className="label">Comparing {items.length}/{4}:</span>
      <div className="chips">
        {items.map((it) => (
          <span key={it.stock_no} className="chip">
            {it.name}
            <button
              type="button"
              onClick={() => toggleCompare(it)}
              aria-label={`Remove ${it.name}`}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn-clear" onClick={() => clearCompare()}>
          Clear
        </button>
        <Link href={`/inventory/compare?ids=${ids}`} className="btn-primary">
          Compare {items.length === 1 ? '' : items.length} →
        </Link>
      </div>
    </div>
  );
}
