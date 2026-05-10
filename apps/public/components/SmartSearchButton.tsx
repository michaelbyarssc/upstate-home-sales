'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Phase H — "Smart search" button next to the inventory search input.
 *
 * When clicked, reads the value from `<input name="q">` in the same form,
 * calls /api/ai/parse-search to convert "3 bed double under 80k" →
 * `{ type: 'double', beds: 3, max_price: 80000 }`, and navigates to
 * /inventory with the structured filters.
 *
 * On parse failure, falls back to the plain `q` parameter (which the
 * existing inventory page already handles via ILIKE).
 *
 * Reads the input via DOM query so it can be dropped into the existing
 * server-component form without restructuring it as a client component.
 */
export function SmartSearchButton({ inputName = 'q' }: { inputName?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    const input = document.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
    const text = (input?.value ?? '').trim();
    if (!text) return;
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/parse-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { filters } = await res.json() as { filters: Record<string, string | number | null | undefined> };
        const params = new URLSearchParams();
        // Only forward fields the inventory page understands today.
        if (filters.type) params.set('type', String(filters.type));
        if (filters.mfr) params.set('mfr', String(filters.mfr));
        if (filters.max_price) {
          // Map to one of the three price buckets the page understands.
          const max = Number(filters.max_price);
          if (max < 100000) params.set('price', 'u100');
          else if (max < 200000) params.set('price', '100-200');
          else params.set('price', 'o200');
        }
        if (filters.q) params.set('q', String(filters.q));
        // Beds isn't a page filter today, but include it so we can support it
        // when the inventory page adds the field. Falls through harmlessly.
        if (filters.beds != null) params.set('beds', String(filters.beds));
        router.push(`/inventory?${params.toString()}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Smart search failed');
        // Fall back to plain text q.
        router.push(`/inventory?q=${encodeURIComponent(text)}`);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn btn-ghost btn-sm"
        title="Try a natural-language query like '3 bed double under 80k'"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        ✨ {pending ? 'Thinking…' : 'Smart search'}
      </button>
      {err && (
        <span style={{ fontSize: 11, color: '#a53a2c', marginLeft: 6 }}>
          {err}
        </span>
      )}
    </>
  );
}
