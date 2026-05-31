/**
 * E-signature provider factory. The app calls `getEsignProvider()` and never
 * imports a concrete vendor — swapping SignWell ⇄ BoldSign is a change here only.
 */

import type { EsignProvider } from './types';
import { SignWellProvider } from './signwell';

export * from './types';

let cached: EsignProvider | null = null;

export function getEsignProvider(): EsignProvider {
  if (cached) return cached;

  const provider = (process.env.ESIGN_PROVIDER ?? 'signwell').toLowerCase();
  switch (provider) {
    case 'signwell': {
      const key = process.env.SIGNWELL_API_KEY;
      if (!key) throw new Error('ESIGN: SIGNWELL_API_KEY is not set');
      cached = new SignWellProvider(key);
      return cached;
    }
    // case 'boldsign': cached = new BoldSignProvider(...); return cached;
    default:
      throw new Error(`ESIGN: unknown ESIGN_PROVIDER "${provider}"`);
  }
}

/** True when e-sign env is configured (so callers can degrade gracefully in dev). */
export function isEsignConfigured(): boolean {
  const provider = (process.env.ESIGN_PROVIDER ?? 'signwell').toLowerCase();
  if (provider === 'signwell') return !!process.env.SIGNWELL_API_KEY;
  return false;
}
