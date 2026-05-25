'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { parseSearchQuery, type ParsedSearch } from '../lib/search-parser';

/**
 * Search input for /inventory. Parses the query client-side via the
 * deterministic parser and pushes the resulting URL params. Fires a
 * fire-and-forget POST to /api/ai/parse-search so the dealer's search
 * report still gets each query logged (no blocking on the network).
 *
 * The sibling type/mfr/price selects in the surrounding filter-bar
 * form are pulled out via DOM so the existing server-rendered form
 * structure stays as-is.
 */

type Manufacturer = { slug: string; name: string };

type Props = {
  defaultValue?: string;
  manufacturers: Manufacturer[];
};

const FILTER_KEYS = [
  'beds',
  'baths',
  'type',
  'mfr',
  'min_price',
  'max_price',
  'min_sqft',
  'max_sqft',
  'q',
] as const;

export function SmartSearchBar({ defaultValue = '', manufacturers }: Props) {
  const router = useRouter();
  const [text, setText] = useState(defaultValue);
  const [, startTransition] = useTransition();

  function readSiblingSelects(): URLSearchParams {
    const params = new URLSearchParams();
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

  function buildParams(query: string, filters: ParsedSearch): URLSearchParams {
    const params = readSiblingSelects();
    for (const key of FILTER_KEYS) {
      const v = filters[key];
      if (v != null && v !== '') params.set(key, String(v));
    }
    // Explicit min/max price beats the legacy bucket — drop it to avoid double-filtering.
    if (params.has('min_price') || params.has('max_price')) params.delete('price');
    // Empty query → no `q` param (cleaner URLs).
    if (!filters.q && query) {
      // Whole query was parsed into structured filters; don't also pass it as q.
    }
    return params;
  }

  function logSearch(query: string, filters: ParsedSearch) {
    // Fire-and-forget — search proceeds whether this succeeds or not.
    void fetch('/api/ai/parse-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filters }),
      keepalive: true,
    }).catch(() => {});
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = text.trim();
    if (!query) {
      const params = readSiblingSelects();
      router.push(`/inventory${params.toString() ? '?' + params.toString() : ''}`);
      return;
    }
    const filters = parseSearchQuery(query, manufacturers);
    const params = buildParams(query, filters);
    logSearch(query, filters);
    startTransition(() => {
      router.push(`/inventory${params.toString() ? '?' + params.toString() : ''}`);
    });
  }

  return (
    <>
      {/*
        The outer filter-bar form is intercepted via this component's
        keydown + button click handlers (a nested <form> would be invalid).
      */}
      <input
        type="text"
        name="q"
        placeholder="Search — try '3/2 Clayton under 80k'"
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
      >
        Filter
      </button>
    </>
  );
}
