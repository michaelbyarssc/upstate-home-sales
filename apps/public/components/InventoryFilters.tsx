'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/**
 * Inventory filter dropdowns (type / manufacturer / price). On change,
 * each select navigates to /inventory with the merged params via
 * router.push — no need for the user to click Filter after every pick.
 *
 * Lives alongside <SmartSearchBar> in the filter-bar form. The bar still
 * handles the q input + smart-search detection; this component owns the
 * three sibling selects.
 */

type Manufacturer = { id: string; slug: string; name: string };

type Props = {
  type: string | undefined;
  mfr: string | undefined;
  price: string | undefined;
  manufacturers: Manufacturer[];
};

export function InventoryFilters({ type, mfr, price, manufacturers }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function pushWith(key: 'type' | 'mfr' | 'price', value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    startTransition(() => {
      router.push(`/inventory${qs ? '?' + qs : ''}`);
    });
  }

  return (
    <>
      <select
        name="type"
        value={type ?? ''}
        onChange={(e) => pushWith('type', e.currentTarget.value)}
      >
        <option value="">All types</option>
        <option value="single">Single-wide</option>
        <option value="double">Double-wide</option>
        <option value="modular">Modular</option>
      </select>
      <select
        name="mfr"
        value={mfr ?? ''}
        onChange={(e) => pushWith('mfr', e.currentTarget.value)}
      >
        <option value="">All manufacturers</option>
        {manufacturers.map((m) => (
          <option key={m.id} value={m.slug}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        name="price"
        value={price ?? ''}
        onChange={(e) => pushWith('price', e.currentTarget.value)}
      >
        <option value="">Any price</option>
        <option value="u100">Under $100k</option>
        <option value="100-200">$100k – $200k</option>
        <option value="o200">$200k+</option>
      </select>
    </>
  );
}
