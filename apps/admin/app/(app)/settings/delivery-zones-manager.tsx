'use client';

import { useState, useTransition } from 'react';
import type { DeliveryZone, ZoneKind } from '@uhs/db';
import { addDeliveryZone, deleteDeliveryZone } from './actions';

type Props = { orgId: string; initialZones: DeliveryZone[] };

export function DeliveryZonesManager({ orgId, initialZones }: Props) {
  const [zones, setZones] = useState(initialZones);
  const [kind, setKind] = useState<ZoneKind>('zip');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!value.trim()) {
      setErr('Enter a zip or county.');
      return;
    }
    start(async () => {
      try {
        const z = await addDeliveryZone({ orgId, kind, value, label: label.trim() || null });
        setZones((prev) => [...prev, z].sort((a, b) => (a.kind + a.value).localeCompare(b.kind + b.value)));
        setValue('');
        setLabel('');
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Add failed');
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm('Remove this zone?')) return;
    start(async () => {
      try {
        await deleteDeliveryZone(id);
        setZones((prev) => prev.filter((z) => z.id !== id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Delete failed');
      }
    });
  }

  const zips = zones.filter((z) => z.kind === 'zip');
  const counties = zones.filter((z) => z.kind === 'county');

  return (
    <div className="card">
      <div className="card-head">
        <h3>Delivery zones</h3>
        <div className="sub">
          Where you&rsquo;ll deliver. Leave empty if you ship anywhere — buyers won&rsquo;t see a service-area banner.
        </div>
      </div>
      <div className="card-body">
        {zones.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginBottom: 16 }}>
            No zones defined yet. The public site will show your inventory to every visitor.
          </p>
        ) : (
          <>
            {zips.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ font: '600 11px/1 var(--f-body)', textTransform: 'uppercase', color: 'var(--adm-ink-mute)', marginBottom: 6, letterSpacing: 0.06 }}>
                  Zip codes ({zips.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {zips.map((z) => (
                    <ZoneChip key={z.id} z={z} onDelete={() => onDelete(z.id)} />
                  ))}
                </div>
              </div>
            )}
            {counties.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ font: '600 11px/1 var(--f-body)', textTransform: 'uppercase', color: 'var(--adm-ink-mute)', marginBottom: 6, letterSpacing: 0.06 }}>
                  Counties ({counties.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {counties.map((z) => (
                    <ZoneChip key={z.id} z={z} onDelete={() => onDelete(z.id)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <form onSubmit={onAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--adm-line)' }}>
          <div className="field" style={{ flex: '0 0 110px' }}>
            <label className="label">Kind</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ZoneKind)}>
              <option value="zip">Zip</option>
              <option value="county">County</option>
            </select>
          </div>
          <div className="field" style={{ flex: '0 0 140px' }}>
            <label className="label">{kind === 'zip' ? 'Zip code' : 'County name'}</label>
            <input
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'zip' ? '29301' : 'Spartanburg'}
              maxLength={kind === 'zip' ? 5 : 80}
            />
          </div>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label className="label">Label (optional)</label>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Spartanburg metro"
              maxLength={80}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: 'var(--adm-accent)', color: '#fff',
              border: 'none', padding: '8px 14px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              opacity: pending ? 0.7 : 1,
            }}
          >
            + Add
          </button>
        </form>

        {err && (
          <div style={{
            padding: 10, borderRadius: 4, fontSize: 13, marginTop: 8,
            background: '#faf0ee', color: '#a53a2c',
          }}>{err}</div>
        )}
      </div>
    </div>
  );
}

function ZoneChip({ z, onDelete }: { z: DeliveryZone; onDelete: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'var(--adm-bg)', border: '1px solid var(--adm-line)',
      padding: '4px 8px 4px 12px', borderRadius: 16,
      fontSize: 12, color: 'var(--adm-ink)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <strong>{z.value}</strong>
      {z.label && <span style={{ color: 'var(--adm-ink-mute)' }}>· {z.label}</span>}
      <button
        type="button"
        onClick={onDelete}
        title="Remove"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-ink-mute)', padding: 0, lineHeight: 1, fontSize: 14 }}
      >
        ×
      </button>
    </span>
  );
}
