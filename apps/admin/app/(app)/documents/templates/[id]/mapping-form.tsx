'use client';

import { useMemo, useState, useTransition } from 'react';
import type { DocSignerRole, DocumentTemplateFieldMap } from '@uhs/db';
import type { EsignTemplateField } from '../../../../../lib/esign';
import { BINDINGS, type BindingDef } from '../../../../../lib/documents/bindings';
import { saveFieldMapping, type FieldMapInput } from '../../actions';

type ExistingRow = Pick<
  DocumentTemplateFieldMap,
  'provider_field_id' | 'label' | 'source' | 'binding_key' | 'signer_role' | 'required'
>;

const ROLE_OPTIONS: { value: DocSignerRole; label: string }[] = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'co_buyer', label: 'Co-buyer' },
  { value: 'seller', label: 'Seller / dealer' },
  { value: 'witness', label: 'Witness' },
];

export function MappingForm({
  templateId,
  placeholders,
  dataFields,
  existing,
}: {
  templateId: string;
  placeholders: string[];
  dataFields: EsignTemplateField[];
  existing: ExistingRow[];
}) {
  // Seed state from any saved mapping.
  const seededSigners: Record<string, DocSignerRole | ''> = {};
  const seededFields: Record<string, string> = {}; // apiId -> binding_key | 'manual' | ''
  for (const r of existing) {
    if (r.source === 'signer' && r.signer_role) seededSigners[r.provider_field_id] = r.signer_role;
    else if (r.source === 'binding' && r.binding_key) seededFields[r.provider_field_id] = r.binding_key;
    else if (r.source === 'manual') seededFields[r.provider_field_id] = 'manual';
  }

  const [signers, setSigners] = useState<Record<string, DocSignerRole | ''>>(() => {
    const init: Record<string, DocSignerRole | ''> = {};
    placeholders.forEach((p) => (init[p] = seededSigners[p] ?? guessRole(p)));
    return init;
  });
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    dataFields.forEach((f) => (init[f.apiId] = seededFields[f.apiId] ?? ''));
    return init;
  });

  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, BindingDef[]>();
    for (const b of BINDINGS) {
      const arr = byGroup.get(b.group) ?? [];
      arr.push(b);
      byGroup.set(b.group, arr);
    }
    return [...byGroup.entries()];
  }, []);

  function save() {
    setMsg(null);
    const rows: FieldMapInput[] = [];
    for (const [placeholder, role] of Object.entries(signers)) {
      if (role) {
        rows.push({
          provider_field_id: placeholder,
          label: placeholder,
          source: 'signer',
          binding_key: null,
          signer_role: role,
          required: true,
        });
      }
    }
    for (const [apiId, val] of Object.entries(fields)) {
      if (!val) continue;
      rows.push({
        provider_field_id: apiId,
        label: apiId,
        source: val === 'manual' ? 'manual' : 'binding',
        binding_key: val === 'manual' ? null : val,
        signer_role: null,
        required: false,
      });
    }
    startTransition(async () => {
      try {
        await saveFieldMapping({ templateId, fields: rows });
        setMsg({ ok: true, text: `Saved — ${rows.length} field${rows.length === 1 ? '' : 's'} mapped.` });
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed.' });
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 760 }}>
      {/* ── Signers ─────────────────────────────────────────── */}
      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Signers</h2>
        <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginBottom: 14 }}>
          Who signs each role on the document. The buyer + co-buyer sign in person on the tablet;
          the seller is you.
        </p>
        {placeholders.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>
            No signer placeholders found on this template.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {placeholders.map((p) => (
              <div key={p} style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>{p}</span>
                <select
                  className="select"
                  value={signers[p] ?? ''}
                  onChange={(e) => setSigners((s) => ({ ...s, [p]: e.target.value as DocSignerRole | '' }))}
                >
                  <option value="">— not a signer —</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Auto-fill fields ────────────────────────────────── */}
      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Auto-fill fields</h2>
        <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginBottom: 14 }}>
          Map each text field to the data that should fill it. The price is snapshotted when the
          document is generated, so later markup changes never alter a sent document.
        </p>
        {dataFields.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>
            No auto-fill fields on this template yet. Add Text fields in your e-sign provider’s editor
            (give each a clear name), then refresh this page to map them.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {dataFields.map((f) => (
              <div key={f.apiId} style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>
                  {f.apiId}
                  <span style={{ fontSize: 11, color: 'var(--adm-ink-mute)', marginLeft: 6 }}>
                    {f.type} · p{f.page}
                  </span>
                </span>
                <select
                  className="select"
                  value={fields[f.apiId] ?? ''}
                  onChange={(e) => setFields((s) => ({ ...s, [f.apiId]: e.target.value }))}
                >
                  <option value="">— leave blank —</option>
                  <option value="manual">Manual (fill at send)</option>
                  {grouped.map(([group, defs]) => (
                    <optgroup key={group} label={group}>
                      {defs.map((b) => (
                        <option key={b.key} value={b.key}>{b.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save mapping'}
        </button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.ok ? '#1d6f3f' : '#a53a2c' }}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

/** Sensible default role from a placeholder name like "Customer #1". */
function guessRole(placeholder: string): DocSignerRole | '' {
  const p = placeholder.toLowerCase();
  if (p.includes('#1') || p.includes('buyer 1') || p === 'customer') return 'buyer';
  if (p.includes('#2') || p.includes('co') || p.includes('buyer 2')) return 'co_buyer';
  if (p.includes('sender') || p.includes('seller') || p.includes('dealer')) return 'seller';
  if (p.includes('witness')) return 'witness';
  return '';
}
