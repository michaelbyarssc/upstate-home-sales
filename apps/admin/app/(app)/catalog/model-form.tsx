'use client';

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { HomeModel, HomeModelPhoto, Manufacturer } from '@uhs/db';
import { uploadModelPhotos } from './photo-upload';
import { createModel, updateModel, archiveModel, deleteModelPhoto } from './actions';

type Props = {
  mode: 'create' | 'edit';
  model?: HomeModel;
  photos?: HomeModelPhoto[];
  manufacturers: Manufacturer[];
  publicPhotoBaseUrl: string;
};

const CONSTRUCTION_OPTIONS = [
  'Standard',
  'Energy Star',
  'Energy Smart Zone II',
  'Energy Smart Zone III',
];

export function ModelForm(props: Props) {
  const { mode, model, photos: initialPhotos = [], manufacturers, publicPhotoBaseUrl } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploading, setUploading] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (mode === 'create') await createModel(fd);
        else await updateModel(model!.id, fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    });
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (mode !== 'edit' || !model) return;
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const inserted = await uploadModelPhotos(model.id, model.org_id, files, photos.length);
      setPhotos((prev) => [...prev, ...inserted]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function onDeletePhoto(photoId: string) {
    if (!model) return;
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    try {
      await deleteModelPhoto(photoId, model.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="sticky-actions">
        <div className="crumb">
          <Link href="/catalog">Catalog</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span className="here">{mode === 'create' ? 'New model' : model?.name}</span>
        </div>
        {error && <span className="bd bd-danger">{error}</span>}
        <Link href="/catalog" style={{ padding: '8px 14px', textDecoration: 'none', color: 'var(--adm-ink-mute)', fontSize: 13, fontWeight: 500 }}>Cancel</Link>
        <button type="submit" disabled={pending} style={{
          background: 'var(--adm-accent)', color: '#fff',
          border: 'none', padding: '9px 16px', borderRadius: 6,
          fontWeight: 500, fontSize: 13, cursor: 'pointer',
          opacity: pending ? 0.7 : 1,
        }}>
          {pending ? 'Saving…' : mode === 'create' ? 'Create model' : 'Save changes'}
        </button>
      </div>

      <div className="page-header">
        <div className="eyebrow">Catalog</div>
        <h1>{mode === 'create' ? 'Add catalog model' : model?.name}</h1>
        {mode === 'edit' && model && (
          <p>Reusable template · Last updated {new Date(model.updated_at).toLocaleString()}</p>
        )}
      </div>

      <div className="inv-grid">
        <div>
          <div className="card">
            <div className="card-head">
              <h3>Identity</h3>
              <div className="sub">What this model is called and who builds it.</div>
            </div>
            <div className="card-body">
              <div className="field">
                <label className="label">Model name <span className="req">*</span></label>
                <input className="input" name="name" required defaultValue={model?.name ?? ''} />
                <div className="help">Shown in the catalog list and on stocked inventory rows. Must be unique within your org.</div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Manufacturer</label>
                  <select className="select" name="manufacturer_id" defaultValue={model?.manufacturer_id ?? ''}>
                    <option value="">—</option>
                    {manufacturers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Series</label>
                  <input className="input" name="series" defaultValue={model?.series ?? ''} placeholder="Clayton Epic, Cavco Pinnacle…" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Model code</label>
                  <input className="input" name="model_code" defaultValue={model?.model_code ?? ''} placeholder="e.g. 30CEE16682AH" />
                  <div className="help">Used as the prefix for stocked stock numbers (e.g. <code>{model?.model_code || 'TIDE'}-001</code>).</div>
                </div>
                <div className="field">
                  <label className="label">Source URL</label>
                  <input className="input" name="source_url" defaultValue={model?.source_url ?? ''} placeholder="https://manufacturer.com/…" />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Specs</h3>
              <div className="sub">Used for filters, badges, and the specs sheet on stocked inventory.</div>
            </div>
            <div className="card-body">
              <div className="field-row three">
                <div className="field">
                  <label className="label">Type</label>
                  <select className="select" name="type" defaultValue={model?.type ?? 'double'}>
                    <option value="double">Double-wide</option>
                    <option value="single">Single-wide</option>
                    <option value="modular">Modular</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Beds</label>
                  <input className="input" name="beds" type="number" min={0} defaultValue={model?.beds ?? ''} />
                </div>
                <div className="field">
                  <label className="label">Baths</label>
                  <input className="input" name="baths" type="number" step={0.5} min={0} defaultValue={model?.baths ?? ''} />
                </div>
              </div>
              <div className="field-row three">
                <div className="field">
                  <label className="label">Sq ft</label>
                  <div className="input-suffix">
                    <input className="input" name="sqft" type="number" min={0} defaultValue={model?.sqft ?? ''} />
                    <span className="sx">sqft</span>
                  </div>
                </div>
                <div className="field">
                  <label className="label">Width</label>
                  <div className="input-suffix">
                    <input className="input" name="width_ft" type="number" min={0} defaultValue={model?.width_ft ?? ''} />
                    <span className="sx">ft</span>
                  </div>
                </div>
                <div className="field">
                  <label className="label">Length</label>
                  <div className="input-suffix">
                    <input className="input" name="length_ft" type="number" min={0} defaultValue={model?.length_ft ?? ''} />
                    <span className="sx">ft</span>
                  </div>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Year built</label>
                  <input className="input" name="year_built" type="number" min={1900} max={2100} defaultValue={model?.year_built ?? ''} />
                </div>
                <div className="field">
                  <label className="label">Construction</label>
                  <select className="select" name="construction" defaultValue={model?.construction ?? ''}>
                    <option value="">—</option>
                    {CONSTRUCTION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {mode === 'edit' && (
            <div className="card">
              <div className="card-head">
                <h3>Photos</h3>
                <div className="sub">Copied to each stocked unit when the model is added to a lot.</div>
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
              <h3>Public copy</h3>
              <div className="sub">Default headline and description copied onto stocked units (still editable per unit).</div>
            </div>
            <div className="card-body">
              <div className="field">
                <label className="label">Headline</label>
                <input className="input" name="headline" defaultValue={model?.headline ?? ''} />
              </div>
              <div className="field">
                <label className="label">Body</label>
                <textarea className="textarea" name="description" rows={5} defaultValue={model?.description ?? ''} />
              </div>
            </div>
          </div>

          {mode === 'edit' && (
            <div className="card" style={{ borderColor: '#e0c0bc' }}>
              <div className="card-head">
                <h3 style={{ color: '#a53a2c' }}>Danger zone</h3>
                <div className="sub">Archived models are hidden from the catalog and can no longer be stocked.</div>
              </div>
              <div className="card-body">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Archive this model? It will be hidden from the catalog. Existing stocked units are not affected.')) {
                      startTransition(async () => {
                        await archiveModel(model!.id);
                        router.push('/catalog');
                      });
                    }
                  }}
                  style={{
                    background: '#fff', color: '#a53a2c', border: '1px solid #e0c0bc',
                    padding: '8px 14px', borderRadius: 6, fontWeight: 500, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Archive this model
                </button>
              </div>
            </div>
          )}
        </div>

        <aside style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-head"><h3>About catalog models</h3></div>
            <div className="card-body" style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>
              <p>A model is a reusable template — manufacturer, specs, photos, and copy in one place.</p>
              <p style={{ marginTop: 8 }}>From the catalog list, check one or more models, pick a lot, and click <strong>Stock now</strong>. Each becomes a new draft inventory home with auto-generated stock #.</p>
              <p style={{ marginTop: 8 }}>Pricing is set per stocked unit, not on the model.</p>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
