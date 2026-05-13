'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { formatCents, type Home, type HomeAddon, type HomePhoto, type Lot, type Manufacturer } from '@uhs/db';
import { uploadPhotos } from './photo-upload';
import { createHome, updateHome, archiveHome, deletePhoto } from './actions';

type Props = {
  mode: 'create' | 'edit';
  home?: Home;
  photos?: HomePhoto[];
  manufacturers: Manufacturer[];
  lots: Lot[];
  publicPhotoBaseUrl: string;
};

const CONSTRUCTION_OPTIONS = [
  'Standard',
  'Energy Star',
  'Energy Smart Zone II',
  'Energy Smart Zone III',
];

export function HomeForm(props: Props) {
  const { mode, home, photos: initialPhotos = [], manufacturers, lots, publicPhotoBaseUrl } = props;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);

  // Live-calc state — drives both the readout and the public preview card.
  const [base, setBase] = useState((home?.base_price_cents ?? 0) / 100);
  const [markup, setMarkup] = useState(Number(home?.markup_pct ?? 0));
  const [addonItems, setAddonItems] = useState<HomeAddon[]>(
    (home?.addons_jsonb as HomeAddon[] | null) ?? []
  );
  const [setup, setSetup] = useState((home?.setup_cents ?? 0) / 100);
  const [setupMarkup, setSetupMarkup] = useState(Number(home?.setup_markup_pct ?? 0));
  const [includeSetup, setIncludeSetup] = useState(home?.include_setup_in_price ?? true);
  const [name, setName] = useState(home?.name ?? '');
  const [mfrId, setMfrId] = useState(home?.manufacturer_id ?? '');
  const [beds, setBeds] = useState<number | ''>(home?.beds ?? '');
  const [baths, setBaths] = useState<number | ''>(home?.baths ?? '');
  const [sqft, setSqft] = useState<number | ''>(home?.sqft ?? '');

  const baseCents = Math.round(base * 100);
  const markupAmtCents = Math.round((baseCents * markup) / 100);
  // Compute per-item addon totals (each with its own markup)
  const addonsMarkedUpCents = addonItems.reduce((sum, a) => {
    const cost = Math.round(a.cost_cents);
    return sum + cost + Math.round((cost * (a.markup_pct ?? 0)) / 100);
  }, 0);
  const addonsCostCents = addonItems.reduce((sum, a) => sum + Math.round(a.cost_cents), 0);
  const addonsMarkupTotalCents = addonsMarkedUpCents - addonsCostCents;
  const setupCents = Math.round(setup * 100);
  const setupMarkupAmtCents = Math.round((setupCents * setupMarkup) / 100);
  const totalCents =
    baseCents +
    markupAmtCents +
    addonsMarkedUpCents +
    (includeSetup ? setupCents + setupMarkupAmtCents : 0);

  const mfrName = manufacturers.find((m) => m.id === mfrId)?.name ?? null;
  const heroPath = photos[0]?.storage_path
    ? `${publicPhotoBaseUrl}/${photos[0].storage_path}`
    : null;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (mode === 'create') await createHome(fd);
        else await updateHome(home!.id, fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (mode !== 'edit' || !home) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const inserted = await uploadPhotos(home.id, home.org_id, files, photos.length);
      setPhotos((prev) => [...prev, ...inserted]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function onDeletePhoto(photoId: string) {
    if (!home) return;
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    try {
      await deletePhoto(photoId, home.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="sticky-actions">
        <div className="crumb">
          <Link href="/inventory">Inventory</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span className="here">{mode === 'create' ? 'New home' : home?.stock_no}</span>
        </div>
        {error && <span className="bd bd-danger">{error}</span>}
        <Link href="/inventory" style={{ padding: '8px 14px', textDecoration: 'none', color: 'var(--adm-ink-mute)', fontSize: 13, fontWeight: 500 }}>Cancel</Link>
        <button type="submit" disabled={pending} style={{
          background: 'var(--adm-accent)', color: '#fff',
          border: 'none', padding: '9px 16px', borderRadius: 6,
          fontWeight: 500, fontSize: 13, cursor: 'pointer',
          opacity: pending ? 0.7 : 1,
        }}>
          {pending ? 'Saving…' : mode === 'create' ? 'Create home' : 'Save changes'}
        </button>
      </div>

      <div className="page-header">
        <div className="eyebrow">Workspace · Inventory</div>
        <h1>{mode === 'create' ? 'Add home' : home?.name}</h1>
        {mode === 'edit' && home && (
          <p>{home.stock_no} · Last updated {new Date(home.updated_at).toLocaleString()}</p>
        )}
      </div>

      <div className="inv-grid">
        {/* LEFT — form */}
        <div>
          <div className="card">
            <div className="card-head">
              <h3>Basics</h3>
              <div className="sub">What this home is, at a glance.</div>
            </div>
            <div className="card-body">
              <div className="field">
                <label className="label">Listing name <span className="req">*</span></label>
                <input className="input" name="name" required defaultValue={home?.name ?? ''} value={name} onChange={(e) => setName(e.target.value)} />
                <div className="help">Headline on the public detail page. Keep it short and human.</div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Manufacturer</label>
                  <select className="select" name="manufacturer_id" value={mfrId} onChange={(e) => setMfrId(e.target.value)}>
                    <option value="">—</option>
                    {manufacturers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Model</label>
                  <input className="input" name="model" defaultValue={home?.model ?? ''} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Stock # <span className="req">*</span></label>
                  <input className="input" name="stock_no" required defaultValue={home?.stock_no ?? ''} />
                  <div className="help">Unique within your org.</div>
                </div>
                <div className="field">
                  <label className="label">Status <span className="req">*</span></label>
                  <select className="select" name="status" defaultValue={home?.status ?? 'draft'}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="hold">Hold</option>
                    <option value="sold">Sold</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Specs</h3>
              <div className="sub">Used for filters, badges, and the specs sheet.</div>
            </div>
            <div className="card-body">
              <div className="field-row three">
                <div className="field">
                  <label className="label">Type</label>
                  <select className="select" name="type" defaultValue={home?.type ?? 'double'}>
                    <option value="double">Double-wide</option>
                    <option value="single">Single-wide</option>
                    <option value="modular">Modular</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Beds</label>
                  <input className="input" name="beds" type="number" min={0} value={beds} onChange={(e) => setBeds(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div className="field">
                  <label className="label">Baths</label>
                  <input className="input" name="baths" type="number" step={0.5} min={0} value={baths} onChange={(e) => setBaths(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              </div>
              <div className="field-row three">
                <div className="field">
                  <label className="label">Sq ft</label>
                  <div className="input-suffix">
                    <input className="input" name="sqft" type="number" min={0} value={sqft} onChange={(e) => setSqft(e.target.value === '' ? '' : Number(e.target.value))} />
                    <span className="sx">sqft</span>
                  </div>
                </div>
                <div className="field">
                  <label className="label">Width</label>
                  <div className="input-suffix">
                    <input className="input" name="width_ft" type="number" min={0} defaultValue={home?.width_ft ?? ''} />
                    <span className="sx">ft</span>
                  </div>
                </div>
                <div className="field">
                  <label className="label">Length</label>
                  <div className="input-suffix">
                    <input className="input" name="length_ft" type="number" min={0} defaultValue={home?.length_ft ?? ''} />
                    <span className="sx">ft</span>
                  </div>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Year built</label>
                  <input className="input" name="year_built" type="number" min={1900} max={2100} defaultValue={home?.year_built ?? ''} />
                </div>
                <div className="field">
                  <label className="label">Construction</label>
                  <select className="select" name="construction" defaultValue={home?.construction ?? ''}>
                    <option value="">—</option>
                    {CONSTRUCTION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* PRICING — the heart of the markup model */}
          <div className="card" style={{ borderColor: '#d8c9b5' }}>
            <div className="card-head" style={{ background: '#FAF4EB' }}>
              <h3>Pricing <span className="bd bd-warn">Internal · not shown to public</span></h3>
              <div className="sub">Set base, markup %, and add-ons. Listed price is calculated by the database.</div>
            </div>
            <div className="card-body">
              <div className="field-row">
                <div className="field">
                  <label className="label">Base price <span className="req">*</span></label>
                  <div className="input-prefix">
                    <span className="px">$</span>
                    <input className="input" name="base_price_dollars" type="number" min={0} step={1}
                      value={base} onChange={(e) => setBase(Number(e.target.value || 0))} />
                  </div>
                  <div className="help">What you pay the factory. Visible only to dealer staff.</div>
                </div>
                <div className="field">
                  <label className="label">Markup %</label>
                  <div className="input-suffix">
                    <input className="input" name="markup_pct" type="number" step={0.5} min={0} max={200}
                      value={markup} onChange={(e) => setMarkup(Number(e.target.value || 0))} />
                    <span className="sx">%</span>
                  </div>
                  <div className="help">Applied on top of base. Default set in <Link href="/settings" style={{ color: 'var(--adm-accent)' }}>org settings</Link>.</div>
                </div>
              </div>
              {/* Itemized add-ons */}
              <input type="hidden" name="addons_jsonb" value={JSON.stringify(addonItems)} />
              <div className="field">
                <label className="label">Add-ons / upgrades <span className="opt">(optional)</span></label>
                <div className="help" style={{ marginBottom: 8 }}>Each add-on has its own cost and markup %. Add as many as needed.</div>
                {addonItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <input
                      className="input"
                      placeholder="Description"
                      style={{ flex: 2 }}
                      value={item.description}
                      onChange={(e) => {
                        const next = addonItems.map((a, j) =>
                          j === i ? { description: e.target.value, cost_cents: a.cost_cents, markup_pct: a.markup_pct } : a
                        );
                        setAddonItems(next);
                      }}
                    />
                    <div className="input-prefix" style={{ flex: 1 }}>
                      <span className="px">$</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="Cost"
                        value={Math.round(item.cost_cents / 100) || ''}
                        onChange={(e) => {
                          const next = addonItems.map((a, j) =>
                            j === i ? { description: a.description, cost_cents: Math.round(Number(e.target.value || 0) * 100), markup_pct: a.markup_pct } : a
                          );
                          setAddonItems(next);
                        }}
                      />
                    </div>
                    <div className="input-suffix" style={{ flex: 0, minWidth: 80 }}>
                      <input
                        className="input"
                        type="number"
                        step={0.5}
                        min={0}
                        max={200}
                        placeholder="0"
                        style={{ width: 60 }}
                        value={item.markup_pct || ''}
                        onChange={(e) => {
                          const next = addonItems.map((a, j) =>
                            j === i ? { description: a.description, cost_cents: a.cost_cents, markup_pct: Number(e.target.value || 0) } : a
                          );
                          setAddonItems(next);
                        }}
                      />
                      <span className="sx">%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddonItems(addonItems.filter((_, j) => j !== i))}
                      style={{
                        background: 'none', border: 'none', color: '#a53a2c',
                        cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 6px',
                      }}
                      aria-label="Remove add-on"
                    >×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAddonItems([...addonItems, { description: '', cost_cents: 0, markup_pct: 0 }])}
                  style={{
                    background: 'none', border: '1px dashed var(--adm-line, #ccc)',
                    borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                    color: 'var(--adm-accent)', fontWeight: 500, marginTop: 4,
                  }}
                >+ Add item</button>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Setup &amp; delivery <span className="opt">(optional)</span></label>
                  <div className="input-prefix">
                    <span className="px">$</span>
                    <input className="input" name="setup_dollars" type="number" min={0} step={1}
                      value={setup} onChange={(e) => setSetup(Number(e.target.value || 0))} />
                  </div>
                  <div className="help">Your cost. Bundled into final price unless toggled below.</div>
                </div>
                <div className="field">
                  <label className="label">Setup markup %</label>
                  <div className="input-suffix">
                    <input className="input" name="setup_markup_pct" type="number" step={0.5} min={0} max={200}
                      value={setupMarkup} onChange={(e) => setSetupMarkup(Number(e.target.value || 0))} />
                    <span className="sx">%</span>
                  </div>
                  <div className="help">Markup applied on top of setup &amp; delivery cost.</div>
                </div>
              </div>
              <div className="field-row" style={{ marginTop: 6 }}>
                <label className="toggle">
                  <input type="checkbox" name="include_setup_in_price" checked={includeSetup} onChange={(e) => setIncludeSetup(e.target.checked)} />
                  <span className="track" />
                  <span className="lbl">Include setup &amp; delivery in listed price</span>
                </label>
                <label className="toggle">
                  <input type="checkbox" name="starting_from" defaultChecked={home?.starting_from ?? false} />
                  <span className="track" />
                  <span className="lbl">Show &quot;starting from&quot; instead of fixed price</span>
                </label>
              </div>

              <div className="calc-readout" style={{ marginTop: 14 }}>
                <div className="row"><span className="lbl">Base</span><span>{formatCents(baseCents)}</span></div>
                <div className="row"><span className="lbl">+ Markup ({markup}%)</span><span>{formatCents(markupAmtCents)}</span></div>
                <div className="row"><span className="lbl">+ Add-ons ({addonItems.length} items)</span><span>{formatCents(addonsCostCents)}</span></div>
                <div className="row"><span className="lbl">+ Add-ons markup</span><span>{formatCents(addonsMarkupTotalCents)}</span></div>
                <div className="row"><span className="lbl">+ Setup &amp; delivery {includeSetup ? '' : '(excluded)'}</span><span>{includeSetup ? formatCents(setupCents) : '—'}</span></div>
                <div className="row"><span className="lbl">+ Setup markup ({setupMarkup}%) {includeSetup ? '' : '(excluded)'}</span><span>{includeSetup ? formatCents(setupMarkupAmtCents) : '—'}</span></div>
                <div className="row total"><span>Listed price (public)</span><span>{formatCents(totalCents)}</span></div>
              </div>
              <div className="help" style={{ marginTop: 8 }}>
                Public site shows <strong style={{ color: 'var(--adm-ink)' }}>listed price only</strong>. Base price &amp; markup never appear in any customer-facing surface.
              </div>
            </div>
          </div>

          {mode === 'edit' && (
            <div className="card">
              <div className="card-head">
                <h3>Photos</h3>
                <div className="sub">First photo is the hero on the public detail page.</div>
              </div>
              <div className="card-body">
                <div className="photo-grid">
                  {photos.map((p, i) => (
                    <div
                      key={p.id}
                      className={`photo-tile ${i === 0 ? 'hero' : ''}`}
                      style={{
                        backgroundImage: `url(${publicPhotoBaseUrl}/${p.storage_path})`,
                      }}
                    >
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => onDeletePhoto(p.id)}
                        aria-label="Remove photo"
                      >×</button>
                    </div>
                  ))}
                  <label className="photo-empty">
                    {uploading ? 'Uploading…' : '+ Add photos'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onPickFiles} />
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h3>Description</h3>
              <div className="sub">Used on the public detail page.</div>
            </div>
            <div className="card-body">
              <div className="field">
                <label className="label">Headline</label>
                <input className="input" name="headline" defaultValue={home?.headline ?? ''} />
              </div>
              <div className="field">
                <label className="label">Body</label>
                <textarea className="textarea" name="description" rows={5} defaultValue={home?.description ?? ''} />
              </div>
            </div>
          </div>

          {mode === 'edit' && (
            <div className="card" style={{ borderColor: '#e0c0bc' }}>
              <div className="card-head">
                <h3 style={{ color: '#a53a2c' }}>Danger zone</h3>
                <div className="sub">Archived homes are hidden everywhere and excluded from the public site.</div>
              </div>
              <div className="card-body">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Archive this home? It will be removed from the public site.')) {
                      startTransition(() => archiveHome(home!.id));
                    }
                  }}
                  style={{
                    background: '#fff', color: '#a53a2c', border: '1px solid #e0c0bc',
                    padding: '8px 14px', borderRadius: 6, fontWeight: 500, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Archive this home
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — sticky sidebar */}
        <aside style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-head"><h3>Public preview</h3></div>
            <div className="card-body" style={{ padding: 12 }}>
              <div
                className="preview-card"
                style={{ padding: 0, border: 'none' }}
              >
                <div
                  className="thumb"
                  style={heroPath ? { backgroundImage: `url(${heroPath})` } : undefined}
                />
                <div className="name">{name || 'Untitled home'}</div>
                <div className="meta">
                  {beds || '—'} bed · {baths || '—'} bath
                  {sqft ? ` · ${sqft.toLocaleString()} sqft` : ''}
                  {mfrName ? ` · ${mfrName}` : ''}
                </div>
                <div className="price">{formatCents(totalCents)}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Visibility</h3></div>
            <div className="card-body">
              <label className="toggle" style={{ marginBottom: 10 }}>
                <input type="checkbox" name="is_featured" defaultChecked={home?.is_featured ?? false} />
                <span className="track" />
                <span className="lbl">Include in featured rotation</span>
              </label>
              <label className="toggle" style={{ marginBottom: 10 }}>
                <input type="checkbox" name="hide_from_search" defaultChecked={home?.hide_from_search ?? false} />
                <span className="track" />
                <span className="lbl">Hide from public search</span>
              </label>
              <label className="toggle">
                <input type="checkbox" name="marketplace_opt_in" defaultChecked={home?.marketplace_opt_in ?? false} />
                <span className="track" />
                <span className="lbl">List on cross-dealer marketplace</span>
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Lot &amp; location</h3></div>
            <div className="card-body">
              <div className="field">
                <label className="label">Lot</label>
                <select className="select" name="lot_id" defaultValue={home?.lot_id ?? ''}>
                  <option value="">— Off-site / unassigned</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">On lot since</label>
                <input className="input" name="on_lot_since" type="date" defaultValue={home?.on_lot_since ?? ''} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
