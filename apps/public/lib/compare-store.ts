/**
 * Tiny client-side store for the inventory compare list.
 *
 * Uses localStorage so the selection persists across page navigations and
 * a custom event so multiple components (the per-card toggle + the sticky
 * bottom bar) stay in sync without a global state library.
 */

const KEY = 'uhs_compare_v1';
const EVENT = 'uhs:compare:change';
export const MAX_COMPARE = 4;

export type CompareItem = { stock_no: string; name: string };

function read(): CompareItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CompareItem[]).slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

function write(items: CompareItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_COMPARE)));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: items }));
  } catch {
    /* ignore quota errors */
  }
}

export function getCompare(): CompareItem[] {
  return read();
}

export function isInCompare(stock_no: string): boolean {
  return read().some((it) => it.stock_no === stock_no);
}

export function toggleCompare(item: CompareItem): { added: boolean; full: boolean } {
  const current = read();
  const exists = current.find((it) => it.stock_no === item.stock_no);
  if (exists) {
    write(current.filter((it) => it.stock_no !== item.stock_no));
    return { added: false, full: false };
  }
  if (current.length >= MAX_COMPARE) {
    return { added: false, full: true };
  }
  write([...current, item]);
  return { added: true, full: false };
}

export function clearCompare() {
  write([]);
}

export function subscribeCompare(listener: (items: CompareItem[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener(read());
  window.addEventListener(EVENT, handler);
  // Cross-tab updates (localStorage event)
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) handler();
  });
  return () => {
    window.removeEventListener(EVENT, handler);
  };
}
