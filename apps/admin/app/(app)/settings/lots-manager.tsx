'use client';

import { useState, useTransition } from 'react';
import type { Lot } from '@uhs/db';
import { addLot, updateLot, archiveLot } from './actions';

export function LotsManager({ orgId, initialLots }: { orgId: string; initialLots: Lot[] }) {
  const [lots, setLots] = useState(initialLots);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    startTransition(async () => {
      try {
        const lot = await addLot({ orgId, name: name.trim(), address: address.trim() || null });
        setLots((prev) => [...prev, lot]);
        setName('');
        setAddress('');
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Add failed');
      }
    });
  }

  function rename(id: string, newName: string) {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l)));
    startTransition(async () => {
      try { await updateLot(id, { name: newName }); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Update failed'); }
    });
  }

  function rmAddr(id: string, newAddress: string) {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, address: newAddress || null } : l)));
    startTransition(async () => {
      try { await updateLot(id, { address: newAddress || null }); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Update failed'); }
    });
  }

  function archive(id: string) {
    if (!confirm('Archive this lot? Inventory tied to it will be unassigned.')) return;
    setLots((prev) => prev.filter((l) => l.id !== id));
    startTransition(async () => {
      try { await archiveLot(id); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Archive failed'); }
    });
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Lots</h3>
        <div className="sub">Physical sales lots. Used for lot-scoping users and labelling inventory.</div>
      </div>
      <div className="card-body">
        {err && <div style={{ background: '#faf0ee', border: '1px solid #e0c0bc', color: '#a53a2c', padding: 10, borderRadius: 4, marginBottom: 12 }}>{err}</div>}

        {lots.length === 0 ? (
          <p style={{ color: 'var(--adm-ink-mute)' }}>No lots yet — add your first below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lots.map((l) => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'center' }}>
                <input className="input" value={l.name} onBlur={(e) => rename(l.id, e.target.value)} defaultValue={l.name} />
                <input className="input" placeholder="Address" defaultValue={l.address ?? ''} onBlur={(e) => rmAddr(l.id, e.target.value)} />
                <button type="button" onClick={() => archive(l.id)} style={{
                  background: '#fff', color: '#a53a2c', border: '1px solid #e0c0bc',
                  padding: '7px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                }}>Archive</button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={add} style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'end' }}>
          <div className="field">
            <label className="label">New lot name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Greenwood" />
          </div>
          <div className="field">
            <label className="label">Address</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <button type="submit" disabled={pending || !name.trim()} style={{
            background: 'var(--adm-accent)', color: '#fff', border: 'none',
            padding: '9px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            opacity: pending || !name.trim() ? 0.5 : 1,
          }}>+ Add lot</button>
        </form>
      </div>
    </div>
  );
}
