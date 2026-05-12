'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@uhs/db/browser';
import { MODEL_3D_ASSETS_BUCKET } from '@uhs/db';
import { attachModelAsset } from './actions';

type Props = {
  homeModelId: string;
  orgId: string;
  nextVersion: number;
  knownSlots: string[];
  existingManifest: Record<string, string | string[]>;
};

const MAX_BYTES = 100 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetUploadForm({ homeModelId, orgId, nextVersion, knownSlots, existingManifest }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [manifestText, setManifestText] = useState<string>(
    JSON.stringify(existingManifest, null, 2),
  );
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Live-validate the manifest JSON for fast feedback.
  const manifestParse = useMemo(() => {
    try {
      const parsed = JSON.parse(manifestText) as Record<string, unknown>;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: 'Manifest must be a JSON object.' };
      }
      const slotsInManifest = Object.keys(parsed);
      const missing = knownSlots.filter((s) => !slotsInManifest.includes(s));
      return {
        ok: true,
        parsed,
        missingSlots: missing,
        extraSlots: slotsInManifest.filter((s) => !knownSlots.includes(s)),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
    }
  }, [manifestText, knownSlots]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setMsg(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith('.glb') && !f.name.toLowerCase().endsWith('.gltf')) {
      setMsg({ kind: 'error', text: 'Pick a .glb or .gltf file.' });
      return;
    }
    if (f.size > MAX_BYTES) {
      setMsg({ kind: 'error', text: `File too large (${formatBytes(f.size)} > ${formatBytes(MAX_BYTES)}).` });
      return;
    }
    setFile(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMsg({ kind: 'error', text: 'Pick a file first.' });
      return;
    }
    if (!manifestParse.ok) {
      setMsg({ kind: 'error', text: `Fix the manifest first — ${manifestParse.error}` });
      return;
    }

    setSubmitting(true);
    setMsg({ kind: 'info', text: 'Uploading…' });

    try {
      const supabase = createClient();
      const ext = file.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
      const path = `${orgId}/${homeModelId}/v${nextVersion}-${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(MODEL_3D_ASSETS_BUCKET)
        .upload(path, file, {
          contentType: ext === 'gltf' ? 'model/gltf+json' : 'model/gltf-binary',
          cacheControl: '3600',
          upsert: false,
        });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      const result = await attachModelAsset({
        homeModelId,
        storagePath: path,
        version: nextVersion,
        materialManifest: manifestParse.parsed as Record<string, string | string[]>,
        metadata: {
          file_name: file.name,
          file_size_bytes: file.size,
          mime: file.type || (ext === 'gltf' ? 'model/gltf+json' : 'model/gltf-binary'),
          uploaded_via: 'admin-ui',
        },
      });
      if (!result.ok) throw new Error(result.error);

      setMsg({ kind: 'success', text: `Uploaded v${nextVersion}. Refresh to see it in the renderer.` });
      setFile(null);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      style={{
        padding: 20,
        background: '#fff',
        border: '1px solid var(--adm-line)',
        borderRadius: 8,
      }}
    >
      <h3 style={{ marginBottom: 6, font: '600 14px/1 var(--f-body)' }}>
        Upload v{nextVersion}
      </h3>
      <p style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
        Drop a .glb / .gltf from Blender or 3ds Max. Bucket: <code>{MODEL_3D_ASSETS_BUCKET}</code>.
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: 'grid', gap: 14 }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 6,
              color: 'var(--adm-ink-mute)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            File
          </label>
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={onPickFile}
            disabled={submitting}
            style={{ fontSize: 13 }}
          />
          {file && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
              {file.name} · {formatBytes(file.size)}
            </div>
          )}
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 6,
              color: 'var(--adm-ink-mute)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            Material manifest (JSON)
          </label>
          <textarea
            value={manifestText}
            onChange={(e) => setManifestText(e.target.value)}
            rows={10}
            spellCheck={false}
            disabled={submitting}
            style={{
              width: '100%',
              padding: 10,
              border: `1px solid ${manifestParse.ok ? 'var(--adm-line)' : '#a53a2c'}`,
              borderRadius: 6,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: 12,
              resize: 'vertical',
            }}
            placeholder={'{\n  "siding_main": "Body_Mesh",\n  "roof_main": "Roof_Mesh"\n}'}
          />
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--adm-ink-mute)' }}>
            Map each option <code>slot_name</code> to the GLB mesh name (or array of names) it controls.
          </div>

          {!manifestParse.ok && (
            <div style={{ marginTop: 6, color: '#a53a2c', fontSize: 12 }}>{manifestParse.error}</div>
          )}
          {manifestParse.ok && manifestParse.missingSlots && manifestParse.missingSlots.length > 0 && (
            <div style={{ marginTop: 6, color: '#a87c1a', fontSize: 12 }}>
              Missing slots from manifest: {manifestParse.missingSlots.join(', ')}
            </div>
          )}
          {manifestParse.ok && manifestParse.extraSlots && manifestParse.extraSlots.length > 0 && (
            <div style={{ marginTop: 6, color: 'var(--adm-ink-mute)', fontSize: 12 }}>
              Manifest contains slots not in catalog options: {manifestParse.extraSlots.join(', ')} (harmless,
              but consider adding them to <a href="options" style={{ color: 'var(--adm-accent)' }}>Options</a>).
            </div>
          )}

          {knownSlots.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 11, color: 'var(--adm-ink-mute)' }}>
              <summary style={{ cursor: 'pointer' }}>Catalog slots ({knownSlots.length})</summary>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {knownSlots.map((s) => <li key={s}><code>{s}</code></li>)}
              </ul>
            </details>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={submitting || !file || !manifestParse.ok}
            style={{
              background: 'var(--adm-accent)',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              opacity: submitting || !file || !manifestParse.ok ? 0.6 : 1,
            }}
          >
            {submitting ? 'Uploading…' : `Upload v${nextVersion}`}
          </button>
        </div>

        {msg && (
          <div
            role="status"
            style={{
              padding: 10,
              borderRadius: 4,
              fontSize: 13,
              background:
                msg.kind === 'success' ? '#e6efe2' :
                msg.kind === 'error' ? '#faf0ee' : 'var(--adm-bg)',
              color:
                msg.kind === 'success' ? '#4a6b3f' :
                msg.kind === 'error' ? '#a53a2c' : 'var(--adm-ink)',
            }}
          >
            {msg.text}
          </div>
        )}
      </form>
    </section>
  );
}
