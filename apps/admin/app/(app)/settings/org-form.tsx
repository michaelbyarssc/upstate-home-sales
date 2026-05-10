'use client';

import { useState, useTransition } from 'react';
import type { Org } from '@uhs/db';
import { saveOrg } from './actions';

export function OrgSettingsForm({ org: initial }: { org: Org }) {
  const [org, setOrg] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function set<K extends keyof Org>(k: K, v: Org[K]) {
    setOrg((prev) => ({ ...prev, [k]: v }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      try {
        await saveOrg({
          id: org.id,
          name: org.name,
          brand_color: org.brand_color,
          default_markup_pct: org.default_markup_pct,
          sms_consent_text: org.sms_consent_text,
          prices_hidden: org.prices_hidden,
        });
        setMsg({ kind: 'success', text: 'Saved.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
      }
    });
  }

  return (
    <form onSubmit={save} className="card">
      <div className="card-head">
        <h3>Org</h3>
        <div className="sub">Brand and pricing defaults.</div>
      </div>
      <div className="card-body">
        <div className="field-row">
          <div className="field">
            <label className="label">Name</label>
            <input className="input" value={org.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Brand color</label>
            <input className="input" type="color" value={org.brand_color ?? '#B9532A'} onChange={(e) => set('brand_color', e.target.value)} style={{ height: 40 }} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label">Default markup %</label>
            <div className="input-suffix">
              <input className="input" type="number" step={0.5} min={0} max={200}
                value={org.default_markup_pct} onChange={(e) => set('default_markup_pct', Number(e.target.value || 0))} />
              <span className="sx">%</span>
            </div>
            <div className="help">New homes inherit this. Per-home overrides on the inventory edit page.</div>
          </div>
          <div className="field">
            <label className="label">Slug</label>
            <input className="input" value={org.slug} disabled />
            <div className="help">Set at org creation. Contact support to change.</div>
          </div>
        </div>
        <div className="field">
          <label className="label">SMS consent text</label>
          <textarea className="textarea" rows={3} value={org.sms_consent_text}
            onChange={(e) => set('sms_consent_text', e.target.value)} />
          <div className="help">Shown next to the consent checkbox on quote forms. Edit with your lawyer.</div>
        </div>

        <div className="field">
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={org.prices_hidden}
              onChange={(e) => set('prices_hidden', e.target.checked)}
            />
            <span>Hide prices on the public site</span>
          </label>
          <div className="help">
            When on, listing/detail/kiosk pages render <strong>"Contact for pricing"</strong> instead of dollar amounts.
            Quotes already sent are unaffected. Useful if competitors are watching and you'd rather quote case-by-case.
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
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
