import type { CatalogAdapter } from '../types';
import claytonEpicJourney from './clayton-epic-journey';
import owntru from './owntru';

export const ADAPTERS: CatalogAdapter[] = [claytonEpicJourney, owntru];

export function findAdapter(url: string): CatalogAdapter | null {
  for (const a of ADAPTERS) {
    if (a.matches(url)) return a;
  }
  return null;
}
