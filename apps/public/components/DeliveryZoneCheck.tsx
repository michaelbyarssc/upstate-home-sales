'use client';

import { useEffect, useState } from 'react';
import { createPublicClient } from '../lib/supabase';

const KEY = 'uhs_buyer_zip_v1';

type Status = 'idle' | 'checking' | 'in_zone' | 'out_of_zone' | 'no_zones_defined';

/**
 * Buyer-facing zip lookup. Confirms whether any of the dealers serving the
 * current inventory list deliver to the buyer's zip. Three states:
 *   - "in_zone": one or more dealers explicitly cover this zip
 *   - "no_zones_defined": no dealer has any zones (treat as "delivers everywhere")
 *   - "out_of_zone": dealers have zones but none match → soft warning
 *
 * Persists the entered zip in localStorage so the banner re-shows on return
 * visits without re-typing.
 */
export function DeliveryZoneCheck() {
  const [zip, setZip] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored && /^\d{5}$/.test(stored)) {
        setZip(stored);
        check(stored);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check(z: string) {
    const cleaned = z.replace(/[^0-9]/g, '').slice(0, 5);
    if (cleaned.length !== 5) {
      setStatus('idle');
      setHint('Enter a 5-digit zip.');
      return;
    }
    setStatus('checking');
    setHint(null);

    const sb = createPublicClient();

    // Are there ANY zones defined site-wide?
    const { count: totalCount } = await sb
      .from('delivery_zones')
      .select('id', { count: 'exact', head: true });

    if (!totalCount) {
      setStatus('no_zones_defined');
      try { localStorage.setItem(KEY, cleaned); } catch { /* ignore */ }
      return;
    }

    // Match against this zip.
    const { count: matchCount } = await sb
      .from('delivery_zones')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'zip')
      .eq('value', cleaned);

    setStatus((matchCount ?? 0) > 0 ? 'in_zone' : 'out_of_zone');
    try { localStorage.setItem(KEY, cleaned); } catch { /* ignore */ }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    check(zip);
  }

  return (
    <div className="delivery-check">
      <form onSubmit={onSubmit} className="delivery-form">
        <label htmlFor="dz-zip" className="delivery-label">Where will it go?</label>
        <input
          id="dz-zip"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
          placeholder="Zip code"
          className="delivery-input"
        />
        <button type="submit" className="delivery-btn" disabled={zip.length !== 5}>
          Check
        </button>
      </form>

      {status === 'checking' && <div className="delivery-banner neutral">Checking…</div>}
      {status === 'in_zone' && (
        <div className="delivery-banner ok">
          ✓ Yes, we deliver to <strong>{zip}</strong>. Browse away.
        </div>
      )}
      {status === 'no_zones_defined' && (
        <div className="delivery-banner ok">
          ✓ We deliver across the South Carolina Upstate. <strong>{zip}</strong> is in our area.
        </div>
      )}
      {status === 'out_of_zone' && (
        <div className="delivery-banner warn">
          ⚠ <strong>{zip}</strong> is outside our usual delivery area, but it might still be possible —
          give us a call at <a href="tel:864-680-4030" style={{ color: 'inherit', fontWeight: 600 }}>(864) 680-4030</a>.
        </div>
      )}
      {hint && <div className="delivery-banner neutral">{hint}</div>}
    </div>
  );
}
