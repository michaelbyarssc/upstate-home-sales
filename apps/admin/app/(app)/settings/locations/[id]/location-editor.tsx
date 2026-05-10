'use client';

import { useState, useTransition } from 'react';
import type { Location, LocationHours, DayHours } from '@uhs/db';
import { updateLocation } from '../actions';

const DAYS: Array<keyof LocationHours> = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<keyof LocationHours, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

const DEFAULT_HOURS: LocationHours = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: { open: '10:00', close: '17:00' },
  sun: { closed: true },
};

export function LocationEditor({ initial }: { initial: Location }) {
  const [loc, setLoc] = useState(initial);
  const [hours, setHours] = useState<LocationHours>(initial.hours_jsonb ?? DEFAULT_HOURS);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  function set<K extends keyof Location>(k: K, v: Location[K]) {
    setLoc((prev) => ({ ...prev, [k]: v }));
  }

  function setDay(day: keyof LocationHours, patch: Partial<DayHours>) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      try {
        await updateLocation(loc.id, {
          name: loc.name,
          slug: loc.slug,
          address: loc.address,
          city: loc.city,
          state: loc.state,
          zip: loc.zip,
          phone: loc.phone,
          brand_color: loc.brand_color,
          lat: loc.lat,
          lng: loc.lng,
          hours_jsonb: hours,
        });
        setMsg({ kind: 'success', text: 'Saved.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
      }
    });
  }

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
      {/* Identity */}
      <section className="card">
        <div className="card-head">
          <h3>Identity</h3>
          <div className="sub">Name + slug control how this location appears on the public site.</div>
        </div>
        <div className="card-body">
          <div className="field-row">
            <div className="field">
              <label className="label">Name</label>
              <input className="input" value={loc.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Slug</label>
              <input className="input" value={loc.slug} onChange={(e) => set('slug', e.target.value)} />
              <div className="help">/{loc.slug}/inventory</div>
            </div>
          </div>
          <div className="field">
            <label className="label">Brand color</label>
            <input
              type="color"
              className="input"
              value={loc.brand_color ?? '#B9532A'}
              onChange={(e) => set('brand_color', e.target.value)}
              style={{ height: 40 }}
            />
            <div className="help">Overrides the org brand color on /{loc.slug} pages. Falls back to org default if blank.</div>
          </div>
        </div>
      </section>

      {/* Address */}
      <section className="card">
        <div className="card-head">
          <h3>Address</h3>
          <div className="sub">Buyer-facing location info; also used for proximity-based lead routing.</div>
        </div>
        <div className="card-body">
          <div className="field">
            <label className="label">Street</label>
            <input className="input" value={loc.address ?? ''} onChange={(e) => set('address', e.target.value || null)} />
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label className="label">City</label>
              <input className="input" value={loc.city ?? ''} onChange={(e) => set('city', e.target.value || null)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">State</label>
              <input
                className="input"
                value={loc.state ?? ''}
                onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2) || null)}
                maxLength={2}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Zip</label>
              <input className="input" value={loc.zip ?? ''} onChange={(e) => set('zip', e.target.value || null)} maxLength={10} />
            </div>
          </div>
          <div className="field">
            <label className="label">Phone</label>
            <input className="input" value={loc.phone ?? ''} onChange={(e) => set('phone', e.target.value || null)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label className="label">Latitude</label>
              <input
                className="input"
                type="number"
                step="0.000001"
                value={loc.lat ?? ''}
                onChange={(e) => set('lat', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label className="label">Longitude</label>
              <input
                className="input"
                type="number"
                step="0.000001"
                value={loc.lng ?? ''}
                onChange={(e) => set('lng', e.target.value === '' ? null : Number(e.target.value))}
              />
              <div className="help">Required for nearest-location lead routing. Leave blank if you don&rsquo;t want this location to be a routing target.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Hours */}
      <section className="card">
        <div className="card-head">
          <h3>Hours</h3>
          <div className="sub">Shown on the public location page. 24-hour format.</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gap: 8 }}>
            {DAYS.map((day) => {
              const h = hours[day] ?? {};
              const closed = h.closed === true;
              return (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 100px', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{DAY_LABELS[day]}</div>
                  <input
                    className="input"
                    type="time"
                    value={h.open ?? ''}
                    disabled={closed}
                    onChange={(e) => setDay(day, { open: e.target.value })}
                  />
                  <input
                    className="input"
                    type="time"
                    value={h.close ?? ''}
                    disabled={closed}
                    onChange={(e) => setDay(day, { close: e.target.value })}
                  />
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={closed}
                      onChange={(e) => setDay(day, { closed: e.target.checked, open: undefined, close: undefined })}
                    />
                    Closed
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {msg && (
        <div style={{
          padding: 10, borderRadius: 4, fontSize: 13,
          background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
          color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={pending} style={{
          background: 'var(--adm-accent)', color: '#fff',
          border: 'none', padding: '10px 16px', borderRadius: 6,
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          opacity: pending ? 0.7 : 1,
        }}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
