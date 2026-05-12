'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/**
 * PR 2.4 — replaces the plain `<input name="q">` + Filter button in the
 * inventory filter bar. Auto-detects natural-language queries
 * (e.g., "3 bed double under 80k") and routes them through /api/ai/parse-search,
 * otherwise falls through to the standard `?q=` ILIKE behavior.
 *
 * Reads the other filter fields (type, mfr, price) out of the surrounding
 * form via DOM so the existing server-rendered <form> doesn't need to be
 * restructured as a client component.
 */

const NL_HINTS = /(under|over|less than|more than|with \d+ ?bed|\$\d|sqft|sq ?ft|cheap|affordable|spacious)/i;

function isNlQuery(text: string): boolean {
  if (!text) return false;
  if (NL_HINTS.test(text)) return true;
  // 4+ words is usually a sentence rather than a plain keyword.
  return text.trim().split(/\s+/).length >= 4;
}

type Props = { defaultValue?: string };

export function SmartSearchBar({ defaultValue = '' }: Props) {
  const router = useRouter();
  const [text, setText] = useState(defaultValue);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function buildBaseParams(): URLSearchParams {
    const params = new URLSearchParams();
    // Pull the sibling selects out of the same <form>.
    const form = document.querySelector<HTMLFormElement>('form.filter-bar');
    if (form) {
      const typeEl = form.querySelector<HTMLSelectElement>('select[name="type"]');
      const mfrEl = form.querySelector<HTMLSelectElement>('select[name="mfr"]');
      const priceEl = form.querySelector<HTMLSelectElement>('select[name="price"]');
      if (typeEl?.value) params.set('type', typeEl.value);
      if (mfrEl?.value) params.set('mfr', mfrEl.value);
      if (priceEl?.value) params.set('price', priceEl.value);
    }
    return params;
  }

  function navigatePlain(query: string) {
    const params = buildBaseParams();
    if (query) params.set('q', query);
    router.push(`/inventory${params.toString() ? '?' + params.toString() : ''}`);
  }

  async function runSmartSearch(query: string) {
    setErr(null);
    try {
      const res = await fetch('/api/ai/parse-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { filters } = (await res.json()) as { filters: Record<string, string | number | null | undefined> };
      const params = buildBaseParams();
      // Smart-search filters take precedence over manual selects when both are set.
      if (filters.type) params.set('type', String(filters.type));
      if (filters.mfr) params.set('mfr', String(filters.mfr));
      if (filters.max_price) {
        const max = Number(filters.max_price);
        if (max < 100000) params.set('price', 'u100');
        else if (max < 200000) params.set('price', '100-200');
        else params.set('price', 'o200');
      }
      if (filters.q) params.set('q', String(filters.q));
      if (filters.beds != null) params.set('beds', String(filters.beds));
      router.push(`/inventory?${params.toString()}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Smart search failed');
      navigatePlain(query);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = text.trim();
    if (!query) {
      navigatePlain('');
      return;
    }
    if (isNlQuery(query)) {
      startTransition(() => runSmartSearch(query));
    } else {
      navigatePlain(query);
    }
  }

  const isSmart = isNlQuery(text);

  return (
    <>
      {/*
        Nested <form> is invalid HTML. Use a sibling form with the same
        action/method so the outer filter-bar form's selects post correctly
        when the user clicks Filter. The outer button click triggers our
        capture-onSubmit handler via JS instead.
      */}
      <input
        type="text"
        name="q"
        placeholder="Search — try '3 bed double under 80k'"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const fakeEvent = { preventDefault() {} } as FormEvent<HTMLFormElement>;
            onSubmit(fakeEvent);
          }
        }}
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          const fakeEvent = { preventDefault() {} } as FormEvent<HTMLFormElement>;
          onSubmit(fakeEvent);
        }}
        disabled={pending}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {pending ? 'Thinking…' : isSmart ? '✨ Smart filter' : 'Filter'}
      </button>
      {err && (
        <span style={{ fontSize: 11, color: '#a53a2c' }} role="alert">
          {err}
        </span>
      )}
    </>
  );
}
