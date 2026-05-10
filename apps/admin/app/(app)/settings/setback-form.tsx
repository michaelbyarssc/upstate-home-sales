'use client';

import { useState, useTransition } from 'react';
import type { OrgSetbackRules } from '@uhs/db';
import { saveSetbackRules } from './actions';

const DEFAULTS: OrgSetbackRules = {
  org_id: '',
  front_ft: 25,
  side_ft: 10,
  rear_ft: 25,
  road_easement_ft: 0,
  updated_at: new Date().toISOString(),
};

export function SetbackForm({ orgId, initial }: { orgId: string; initial: OrgSetbackRules | null }) {
  const [rules, setRules] = useState<OrgSetbackRules>(initial ?? { ...DEFAULTS, org_id: orgId });
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function set<K extends keyof OrgSetbackRules>(k: K, v: OrgSetbackRules[K]) {
    setRules((prev) => ({ ...prev, [k]: v }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      try {
        const saved = await saveSetbackRules({
          orgId,
          front_ft: rules.front_ft,
          side_ft: rules.side_ft,
          rear_ft: rules.rear_ft,
          road_easement_ft: rules.road_easement_ft,
        });
        setRules(saved);
        setMsg({ kind: 'success', text: 'Saved.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
      }
    });
  }

  return (
    <form onSubmit={save} className="card">
      <div className="card-head">
        <h3>Property setbacks</h3>
        <div className="sub">Used by the property-mapping placement page to draw the no-build zone.</div>
      </div>
      <div className="card-body">
        <div className="field-row">
          <div className="field">
            <label className="label">Front (ft)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={200}
              value={rules.front_ft}
              onChange={(e) => set('front_ft', Number(e.target.value || 0))}
            />
          </div>
          <div className="field">
            <label className="label">Side (ft)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={200}
              value={rules.side_ft}
              onChange={(e) => set('side_ft', Number(e.target.value || 0))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label">Rear (ft)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={200}
              value={rules.rear_ft}
              onChange={(e) => set('rear_ft', Number(e.target.value || 0))}
            />
          </div>
          <div className="field">
            <label className="label">Road easement (ft)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={200}
              value={rules.road_easement_ft}
              onChange={(e) => set('road_easement_ft', Number(e.target.value || 0))}
            />
            <div className="help">Extra setback for road frontage; usually 0.</div>
          </div>
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
            {pending ? 'Saving…' : 'Save setbacks'}
          </button>
        </div>
      </div>
    </form>
  );
}
