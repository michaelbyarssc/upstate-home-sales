'use client';

import { useState, useTransition } from 'react';
import { formatCents, type HomeRegionPricing, type RegionKind } from '@uhs/db';
import { addRegionPrice, deleteRegionPrice } from './actions';

export function RegionalPricingManager({
  homeId,
  baseListedPriceCents,
  initial,
}: {
  homeId: string;
  baseListedPriceCents: number;
  initial: HomeRegionPricing[];
}) {
  const [prices, setPrices] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [regionType, setRegionType] = useState<RegionKind>('zip');
  const [regionValue, setRegionValue] = useState('');
  const [overrideDollars, setOverrideDollars] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');

  function add(e: React.FormEvent) {
    e.preventDefault();
    const dollars = Number(overrideDollars.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setMsg({ kind: 'error', text: 'Override price must be positive' });
      return;
    }
    if (!regionValue.trim()) {
      setMsg({ kind: 'error', text: 'Region value is required' });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      try {
        const row = await addRegionPrice({
          homeId,
          regionType,
          regionValue: regionValue.trim(),
          overridePriceDollars: dollars,
          effectiveAt: effectiveAt || null,
          expiresAt: expiresAt || null,
          notes: notes.trim() || null,
        });
        setPrices((prev) => [...prev, row]);
        setRegionValue('');
        setOverrideDollars('');
        setEffectiveAt('');
        setExpiresAt('');
        setNotes('');
        setMsg({ kind: 'success', text: 'Override added.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Add failed' });
      }
    });
  }

  function rm(id: string, label: string) {
    if (!confirm(`Remove the override for ${label}?`)) return;
    startTransition(async () => {
      try {
        await deleteRegionPrice(id, homeId);
        setPrices((prev) => prev.filter((p) => p.id !== id));
        setMsg({ kind: 'success', text: 'Override removed.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Delete failed' });
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
      <section className="card">
        <div className="card-head">
          <h3>Active overrides ({prices.length})</h3>
          <div className="sub">Base listed price: {formatCents(baseListedPriceCents)}</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {prices.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--adm-ink-mute)' }}>
              No overrides yet. Add one below to charge a different price for buyers in a specific region.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAF4EB', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontSize: 12, color: 'var(--adm-ink-mute)' }}>Region</th>
                  <th style={{ padding: '8px 12px', fontSize: 12, color: 'var(--adm-ink-mute)' }}>Override</th>
                  <th style={{ padding: '8px 12px', fontSize: 12, color: 'var(--adm-ink-mute)' }}>Effective</th>
                  <th style={{ padding: '8px 12px', fontSize: 12, color: 'var(--adm-ink-mute)' }}>Notes</th>
                  <th style={{ padding: '8px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => {
                  const label = `${p.region_type} ${p.region_value}`;
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--adm-line, #e5dfd1)' }}>
                      <td style={{ padding: '10px 12px', fontSize: 13 }}>
                        <span style={{
                          background: '#fff', border: '1px solid #C5B79F',
                          padding: '2px 6px', borderRadius: 3, fontSize: 11,
                          textTransform: 'uppercase', marginRight: 6,
                        }}>{p.region_type}</span>
                        <strong>{p.region_value}</strong>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCents(p.override_price_cents)}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                        {p.effective_at ? new Date(p.effective_at).toLocaleDateString() : 'Always'}
                        {p.expires_at && <> → {new Date(p.expires_at).toLocaleDateString()}</>}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                        {p.notes || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => rm(p.id, label)}
                          disabled={pending}
                          style={{
                            background: 'transparent', border: '1px solid #a53a2c',
                            color: '#a53a2c', padding: '3px 8px',
                            borderRadius: 4, fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Add override</h3>
          <div className="sub">For each (home, region) pair, only one override is allowed. Re-add to update.</div>
        </div>
        <form onSubmit={add} className="card-body">
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Region type</label>
              <select
                className="input"
                value={regionType}
                onChange={(e) => setRegionType(e.target.value as RegionKind)}
              >
                <option value="zip">Zip</option>
                <option value="county">County</option>
                <option value="state">State</option>
              </select>
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label className="label">Region value</label>
              <input
                className="input"
                value={regionValue}
                onChange={(e) => setRegionValue(e.target.value)}
                placeholder={
                  regionType === 'zip' ? '29073' :
                  regionType === 'county' ? 'Lexington' : 'SC'
                }
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Override price</label>
              <div className="input-suffix">
                <span className="sx">$</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={overrideDollars}
                  onChange={(e) => setOverrideDollars(e.target.value)}
                  placeholder="89,500"
                />
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="label">Effective at (optional)</label>
              <input
                className="input"
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
              />
              <div className="help">Blank = effective immediately.</div>
            </div>
            <div className="field">
              <label className="label">Expires at (optional)</label>
              <input
                className="input"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <div className="help">Blank = no expiry.</div>
            </div>
          </div>
          <div className="field">
            <label className="label">Notes</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Seasonal promotion, dealer-direct in this county, etc."
            />
          </div>

          {msg && (
            <div style={{
              padding: 10, borderRadius: 4, fontSize: 13, marginTop: 8,
              background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
              color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
            }}>{msg.text}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="submit" disabled={pending} style={{
              background: 'var(--adm-accent)', color: '#fff',
              border: 'none', padding: '9px 16px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              opacity: pending ? 0.7 : 1,
            }}>
              {pending ? 'Adding…' : 'Add override'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
