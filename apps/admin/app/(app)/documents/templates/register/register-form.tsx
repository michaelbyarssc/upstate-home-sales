'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DocumentTemplateKind } from '@uhs/db';
import type { EsignTemplateSummary } from '../../../../../lib/esign';
import { registerTemplate } from '../../actions';

const KINDS: { value: DocumentTemplateKind; label: string }[] = [
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'purchase_agreement', label: 'Purchase Agreement' },
  { value: 'disclosure', label: 'Disclosure' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'generic', label: 'Document' },
];

export function RegisterForm({ templates }: { templates: EsignTemplateSummary[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? '');
  const [name, setName] = useState<string>(templates[0]?.name ?? '');
  const [kind, setKind] = useState<DocumentTemplateKind>('purchase_order');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (templates.length === 0) {
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--adm-ink-mute)' }}>
        <p style={{ fontSize: 15 }}>No new templates to register.</p>
        <p style={{ fontSize: 13, marginTop: 4 }}>
          Build a template in your e-sign provider and mark it finished, then come back.
        </p>
      </div>
    );
  }

  function pick(id: string) {
    setSelectedId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setName(t.name);
  }

  function submit() {
    setErr(null);
    if (!selectedId) {
      setErr('Pick a template.');
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await registerTemplate({ providerTemplateId: selectedId, name, kind });
        router.push(`/documents/templates/${id}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Register failed.');
      }
    });
  }

  return (
    <div className="card" style={{ padding: 20, maxWidth: 620 }}>
      <label className="field">
        <span className="field-label">Provider template</span>
        <select value={selectedId} onChange={(e) => pick(e.target.value)} className="select">
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.status ? `· ${t.status}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="field" style={{ marginTop: 12 }}>
        <span className="field-label">Display name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field" style={{ marginTop: 12 }}>
        <span className="field-label">Document type</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as DocumentTemplateKind)} className="select">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      {err && <div style={{ color: '#a53a2c', fontSize: 13, marginTop: 12 }}>{err}</div>}

      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        <button type="button" className="btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Registering…' : 'Register & map fields'}
        </button>
      </div>
    </div>
  );
}
