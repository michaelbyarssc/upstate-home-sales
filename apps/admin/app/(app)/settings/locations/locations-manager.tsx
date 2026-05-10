'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Location } from '@uhs/db';
import {
  createLocation,
  archiveLocation,
  setDefaultLocation,
} from './actions';

export function LocationsManager({ orgId, initial }: { orgId: string; initial: Location[] }) {
  const [locations, setLocations] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Add-form state.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SC');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const loc = await createLocation({
          name: name.trim(),
          slug: slug.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          phone: phone.trim() || null,
        });
        setLocations((prev) => [...prev, loc].sort((a, b) =>
          a.is_default === b.is_default
            ? a.name.localeCompare(b.name)
            : a.is_default ? -1 : 1,
        ));
        setName(''); setSlug(''); setAddress(''); setCity(''); setZip(''); setPhone('');
        setMsg({ kind: 'success', text: `Added ${loc.name}` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Add failed' });
      }
    });
  }

  function makeDefault(id: string) {
    setMsg(null);
    startTransition(async () => {
      try {
        await setDefaultLocation(id);
        setLocations((prev) =>
          prev.map((l) => ({ ...l, is_default: l.id === id })).sort((a, b) =>
            a.is_default === b.is_default
              ? a.name.localeCompare(b.name)
              : a.is_default ? -1 : 1,
          ),
        );
        setMsg({ kind: 'success', text: 'Default location updated.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Update failed' });
      }
    });
  }

  function archive(id: string, locName: string) {
    if (!confirm(`Archive "${locName}"? Inventory tied to it will be unassigned but not deleted.`)) return;
    setMsg(null);
    startTransition(async () => {
      try {
        await archiveLocation(id);
        setLocations((prev) => prev.filter((l) => l.id !== id));
        setMsg({ kind: 'success', text: `Archived ${locName}` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Archive failed' });
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 900 }}>
      {/* Existing locations */}
      <section className="card">
        <div className="card-head">
          <h3>Locations ({locations.length})</h3>
          <div className="sub">Default location is shown first; it&rsquo;s the fallback when buyer zip doesn&rsquo;t match anything.</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {locations.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--adm-ink-mute)' }}>No locations yet. Add one below.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {locations.map((loc) => (
                <li
                  key={loc.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    padding: '14px 16px',
                    borderTop: '1px solid var(--adm-line, #e5dfd1)',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Link
                        href={`/settings/locations/${loc.id}`}
                        style={{ color: 'var(--adm-ink)', textDecoration: 'none' }}
                      >
                        {loc.name}
                      </Link>
                      {loc.is_default && (
                        <span style={{
                          background: '#FAF4EB', border: '1px solid #d8c9b5',
                          color: 'var(--adm-ink-mute)', fontSize: 11,
                          padding: '2px 6px', borderRadius: 3,
                        }}>Default</span>
                      )}
                      <span style={{ color: 'var(--adm-ink-mute)', fontSize: 12 }}>
                        /{loc.slug}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 2 }}>
                      {[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ') || 'No address'}
                      {loc.phone && <> · {loc.phone}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {!loc.is_default && (
                      <button
                        type="button"
                        onClick={() => makeDefault(loc.id)}
                        disabled={pending}
                        style={{
                          background: '#fff', border: '1px solid var(--adm-accent)',
                          color: 'var(--adm-accent)', padding: '4px 10px',
                          borderRadius: 4, fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        Make default
                      </button>
                    )}
                    <Link
                      href={`/settings/locations/${loc.id}`}
                      style={{
                        background: '#fff', border: '1px solid #C5B79F',
                        color: 'var(--adm-ink)', padding: '4px 10px',
                        borderRadius: 4, fontSize: 12, textDecoration: 'none',
                      }}
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => archive(loc.id, loc.name)}
                      disabled={pending || loc.is_default}
                      title={loc.is_default ? 'Promote another location to default first' : ''}
                      style={{
                        background: 'transparent', border: '1px solid #a53a2c',
                        color: '#a53a2c', padding: '4px 10px',
                        borderRadius: 4, fontSize: 12, cursor: loc.is_default ? 'not-allowed' : 'pointer',
                        opacity: loc.is_default ? 0.4 : 1,
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Add new location */}
      <section className="card">
        <div className="card-head">
          <h3>Add location</h3>
          <div className="sub">A new location starts with org defaults for branding; edit per-location after adding.</div>
        </div>
        <form onSubmit={add} className="card-body">
          <div className="field-row">
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lexington Lot" />
            </div>
            <div className="field">
              <label className="label">Slug</label>
              <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="(auto from name)" />
              <div className="help">URL: /{slug || '(auto)'}/inventory</div>
            </div>
          </div>
          <div className="field">
            <label className="label">Street address</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label className="label">City</label>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">State</label>
              <input className="input" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Zip</label>
              <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} maxLength={10} />
            </div>
          </div>
          <div className="field">
            <label className="label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(864) 555-0100" />
          </div>

          {msg && (
            <div style={{
              padding: 10, borderRadius: 4, fontSize: 13, marginTop: 8,
              background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
              color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
            }}>{msg.text}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="submit" disabled={pending || !name.trim()} style={{
              background: 'var(--adm-accent)', color: '#fff',
              border: 'none', padding: '9px 16px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              opacity: pending || !name.trim() ? 0.5 : 1,
            }}>
              {pending ? 'Adding…' : 'Add location'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
