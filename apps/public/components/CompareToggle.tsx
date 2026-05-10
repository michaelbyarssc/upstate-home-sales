'use client';

import { useEffect, useState } from 'react';
import { isInCompare, subscribeCompare, toggleCompare, type CompareItem } from '../lib/compare-store';

type Props = { stock_no: string; name: string };

export function CompareToggle({ stock_no, name }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isInCompare(stock_no));
    return subscribeCompare(() => setActive(isInCompare(stock_no)));
  }, [stock_no]);

  function handle(e: React.MouseEvent) {
    // Don't navigate to the card link when clicking the toggle.
    e.preventDefault();
    e.stopPropagation();
    const result = toggleCompare({ stock_no, name } as CompareItem);
    if (result.full) {
      // Soft alert — the user tried to add a 5th.
      alert('You can compare up to 4 homes at a time.');
    }
  }

  return (
    <button
      type="button"
      className={`compare-toggle${active ? ' active' : ''}`}
      onClick={handle}
      aria-pressed={active}
      title={active ? 'Remove from compare' : 'Add to compare'}
    >
      {active ? '✓ Compare' : '+ Compare'}
    </button>
  );
}
