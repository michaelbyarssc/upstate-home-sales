'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { HomeType, Lot } from '@uhs/db';
import { stockModelsOnLot } from './actions';

export type CatalogRow = {
  id: string;
  name: string;
  model_code: string | null;
  series: string | null;
  type: HomeType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  manufacturer_name: string | null;
  photo_count: number;
  hero_url: string | null;
};

export function CatalogTable({
  rows,
  lots,
}: {
  rows: CatalogRow[];
  lots: Pick<Lot, 'id' | 'name'>[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lotId, setLotId] = useState<string>(lots[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  const selectedCount = selected.size;
  const allChecked = useMemo(() => rows.length > 0 && rows.every((r) => selected.has(r.id)), [rows, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function onStock() {
    if (selectedCount === 0 || !lotId) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const result = await stockModelsOnLot({
          modelIds: [...selected],
          lotId,
        });
        const lotName = lots.find((l) => l.id === lotId)?.name ?? 'lot';
        setMsg({
          kind: 'success',
          text: `Stocked ${result.created} home${result.created === 1 ? '' : 's'} on ${lotName} (${result.stockNos.join(', ')}).`,
        });
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Stocking failed' });
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <h3>No catalog models</h3>
        <p>Add your first model to start building a reusable catalog.</p>
        <Link href="/catalog/new" style={{
          background: 'var(--adm-accent)', color: '#fff', padding: '10px 16px',
          borderRadius: 6, textDecoration: 'none', fontWeight: 500, fontSize: 13,
          display: 'inline-block',
        }}>+ Add a model</Link>
      </div>
    );
  }

  return (
    <>
      {msg && (
        <div style={{
          padding: 12, borderRadius: 4, marginBottom: 12, fontSize: 13,
          background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
          color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
          border: `1px solid ${msg.kind === 'success' ? '#bcd1ad' : '#e0c0bc'}`,
        }}>{msg.text}</div>
      )}

      <table className="inv-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" />
            </th>
            <th>Model</th>
            <th>Type</th>
            <th>Beds/Baths</th>
            <th className="num">Sq ft</th>
            <th>Manufacturer</th>
            <th>Series</th>
            <th className="num">Photos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={selected.has(r.id) ? 'selected' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select ${r.name}`}
                />
              </td>
              <td>
                <div className="row-name">
                  <div
                    className="row-thumb"
                    style={r.hero_url ? { backgroundImage: `url(${r.hero_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  />
                  <div>
                    <Link href={`/catalog/${r.id}`}>{r.name}</Link>
                    <div className="sub">{r.model_code ?? '—'}</div>
                  </div>
                </div>
              </td>
              <td>{r.type === 'single' ? 'Single-wide' : r.type === 'double' ? 'Double-wide' : 'Modular'}</td>
              <td>{r.beds ?? '—'}/{r.baths ?? '—'}</td>
              <td className="num">{r.sqft?.toLocaleString() ?? '—'}</td>
              <td>{r.manufacturer_name ?? '—'}</td>
              <td>{r.series ?? '—'}</td>
              <td className="num">{r.photo_count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedCount > 0 && (
        <div className="catalog-action-bar">
          <span className="count">{selectedCount} selected</span>
          <span className="spacer" />
          <label className="lbl">Stock on lot</label>
          <select className="select" value={lotId} onChange={(e) => setLotId(e.target.value)} disabled={pending}>
            {lots.length === 0 && <option value="">No active lots</option>}
            {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button
            type="button"
            disabled={pending || !lotId || selectedCount === 0}
            onClick={onStock}
            style={{
              background: 'var(--adm-accent)', color: '#fff', border: 'none',
              padding: '9px 16px', borderRadius: 6, fontWeight: 500, fontSize: 13,
              cursor: 'pointer', opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? 'Stocking…' : `Stock ${selectedCount} now`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setSelected(new Set())}
            style={{
              background: '#fff', color: 'var(--adm-ink-mute)', border: '1px solid var(--adm-line)',
              padding: '9px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', marginLeft: 8,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <style>{`
        .inv-table tr.selected { background: #fcf6ec; }
        .catalog-action-bar {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff;
          border: 1px solid var(--adm-line);
          border-radius: 8px;
          padding: 12px 18px;
          box-shadow: 0 6px 24px rgba(31, 28, 23, 0.18);
          z-index: 50;
          font-size: 13px;
          min-width: 480px;
        }
        .catalog-action-bar .count { font-weight: 600; }
        .catalog-action-bar .spacer { flex: 1; }
        .catalog-action-bar .lbl { color: var(--adm-ink-mute); }
        .catalog-action-bar .select {
          padding: 8px 10px; font-size: 13px;
          border: 1px solid var(--adm-line); border-radius: 4px; background: #fff;
        }
      `}</style>
    </>
  );
}
