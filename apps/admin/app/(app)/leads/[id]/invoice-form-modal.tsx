'use client';

import { useState, useTransition } from 'react';
import type { LineItem } from '@uhs/db';
import { createInvoice } from './actions';

type Props = {
  leadId: string;
  orgId: string;
  homeId: string;
  homeName: string;
  defaultLineItems: LineItem[];
  onClose: () => void;
  onCreated: (token: string, invoiceNumber: number) => void;
};

const TERMS_OPTIONS = [
  'Due on receipt',
  'Net 15',
  'Net 30',
  'Due at closing',
  'Per financing agreement',
];

function fmtDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

export function InvoiceFormModal({
  leadId,
  orgId,
  homeId,
  homeName,
  defaultLineItems,
  onClose,
  onCreated,
}: Props) {
  const [items, setItems] = useState<LineItem[]>(defaultLineItems);
  const [notes, setNotes] = useState<string[]>([
    'This invoice is for the complete turn-key package as described above.',
    'All prices subject to change based on site conditions and county requirements.',
  ]);
  const [paymentTerms, setPaymentTerms] = useState('Due on receipt');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const total = items.reduce((s, i) => s + (i.amount_cents ?? 0), 0);

  function updateItem(index: number, field: 'description' | 'amount_cents', value: string) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'description') return { ...item, description: value };
        const trimmed = value.replace(/[^0-9.]/g, '');
        return { ...item, amount_cents: trimmed === '' ? null : Math.round(parseFloat(trimmed) * 100) || 0 };
      }),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', amount_cents: null }]);
  }

  function updateNote(index: number, value: string) {
    setNotes((prev) => prev.map((n, i) => (i === index ? value : n)));
  }

  function removeNote(index: number) {
    setNotes((prev) => prev.filter((_, i) => i !== index));
  }

  function addNote() {
    setNotes((prev) => [...prev, '']);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      setErr('Add at least one line item');
      return;
    }
    setErr(null);

    startTransition(async () => {
      try {
        const inv = await createInvoice({
          leadId,
          orgId,
          homeId,
          lineItems: validItems,
          notes: notes.filter((n) => n.trim()),
          paymentTerms,
          paymentInstructions: paymentInstructions || null,
          dueAt: dueAt || null,
          sendEmail,
        });
        onCreated(inv.public_token, inv.invoice_number);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Invoice creation failed');
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 680, maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Create Invoice — {homeName}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {/* Line items */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 32px', gap: 8, marginBottom: 6 }}>
                <span className="field-label">Description</span>
                <span className="field-label">Amount</span>
                <span />
              </div>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 32px', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text" value={item.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                    placeholder="Item description"
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--adm-line)', borderRadius: 'var(--r-1)' }}
                  />
                  <input
                    type="text"
                    value={item.amount_cents != null ? (item.amount_cents / 100).toFixed(2) : ''}
                    onChange={(e) => updateItem(i, 'amount_cents', e.target.value)}
                    placeholder="Included"
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--adm-line)', borderRadius: 'var(--r-1)', textAlign: 'right' }}
                  />
                  <button type="button" onClick={() => removeItem(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-ink-mute)', fontSize: 16 }}>×</button>
                </div>
              ))}
              <button type="button" onClick={addItem}
                style={{ background: 'none', border: '1px dashed var(--adm-line)', padding: '6px 12px', fontSize: 12, color: 'var(--adm-accent)', cursor: 'pointer', borderRadius: 'var(--r-1)', width: '100%' }}>
                + Add option
              </button>
            </div>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f6efe6', borderRadius: 'var(--r-1)', marginTop: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--adm-ink-mute)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</span>
              <span style={{ fontSize: 22, fontFamily: 'Georgia, serif', color: '#b9532a', fontWeight: 500 }}>{fmtDollars(total)}</span>
            </div>

            {/* Payment terms */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="field-label">Payment Terms</span>
                <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                  {TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Due Date (optional)</span>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Payment Instructions (optional)</span>
              <textarea
                value={paymentInstructions}
                onChange={(e) => setPaymentInstructions(e.target.value)}
                placeholder="e.g., Make checks payable to Upstate Home Sales LLC…"
                rows={3}
              />
            </label>

            {/* Notes */}
            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>Notes</span>
              {notes.map((note, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input type="text" value={note} onChange={(e) => updateNote(i, e.target.value)}
                    placeholder="Note…"
                    style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid var(--adm-line)', borderRadius: 'var(--r-1)' }} />
                  <button type="button" onClick={() => removeNote(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-ink-mute)', fontSize: 16 }}>×</button>
                </div>
              ))}
              <button type="button" onClick={addNote}
                style={{ background: 'none', border: '1px dashed var(--adm-line)', padding: '6px 12px', fontSize: 12, color: 'var(--adm-accent)', cursor: 'pointer', borderRadius: 'var(--r-1)', width: '100%' }}>
                + Add note
              </button>
            </div>

            {/* Email option */}
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Email invoice to customer</span>
            </label>

            {err && <div style={{ color: '#a53a2c', fontSize: 13 }}>{err}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? 'Creating…' : sendEmail ? 'Send Invoice' : 'Save Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
