'use client';

import { useEffect } from 'react';

type Props = { stock_no: string; name: string };

const KEY = 'uhs_recent_views_v1';
const MAX = 10;

/**
 * Records this home in localStorage when the detail page mounts.
 * No DB write — purely client-side; can be surfaced later as a
 * "Recently viewed" rail on the inventory list or homepage.
 */
export function RecentlyViewedRecorder({ stock_no, name }: Props) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const list: Array<{ stock_no: string; name: string; ts: number }> = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((x) => x.stock_no !== stock_no);
      filtered.unshift({ stock_no, name, ts: Date.now() });
      localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));
    } catch {
      /* ignore quota or parse errors */
    }
  }, [stock_no, name]);
  return null;
}
