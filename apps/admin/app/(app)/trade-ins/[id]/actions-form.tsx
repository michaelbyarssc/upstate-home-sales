'use client';

import { useState, useTransition } from 'react';
import { formatCents, type TradeIn } from '@uhs/db';
import { updateTradeIn } from './actions';

const STATUSES: TradeIn['status'][] = ['submitted', 'reviewed', 'offered', 'accepted', 'declined'];

export function TradeInActions({ tradeIn }: { tradeIn: TradeIn }) {
  const [status, setStatus] = useState(tradeIn.status);
  const [offerDollars, setOfferDollars] = useState(
    tradeIn.offer_cents ? String(tradeIn.offer_cents / 100) : '',
  );
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    startTransition(async () => {
      try {
        const cents = offerDollars ? Math.round(Number(offerDollars) * 100) : null;
        await updateTradeIn(tradeIn.id, { status, offer_cents: cents });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Review</h3></div>
      <div className="card-body">
        <div className="field">
          <label className="label">Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as TradeIn['status'])}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label">Preliminary offer</label>
          <div className="input-prefix">
            <span className="px">$</span>
            <input className="input" type="number" min={0} value={offerDollars}
              onChange={(e) => setOfferDollars(e.target.value)} />
          </div>
          <div className="help">Saved on the trade-in record. Send the customer the actual offer via email.</div>
        </div>

        {err && <div className="banner-warn">{err}</div>}

        <button type="button" onClick={save} disabled={pending} style={{
          width: '100%',
          background: 'var(--adm-accent)', color: '#fff',
          border: 'none', padding: '10px 14px', borderRadius: 6,
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          opacity: pending ? 0.7 : 1,
        }}>
          {pending ? 'Saving…' : 'Save'}
        </button>

        {tradeIn.offer_cents && (
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
            Current offer: <strong style={{ color: 'var(--adm-ink)' }}>{formatCents(tradeIn.offer_cents)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
