'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import type { LineItem } from '@uhs/db';
import { createPurchaseOrder } from './actions';
import { PdfCanvasViewer, type HomeOption } from './quote-form-modal';

type Props = {
  leadId: string;
  orgId: string;
  homeId: string | null;
  homeName: string | null;
  defaultLineItems: LineItem[];
  homes: HomeOption[];
  quoteId?: string;
  onClose: () => void;
  onCreated: (token: string, poNumber: number) => void;
};

function fmtDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function HomeSelect({
  homes,
  selectedId,
  onChange,
}: {
  homes: HomeOption[];
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = homes.find((h) => h.id === selectedId);
  const filtered = search
    ? homes.filter(
        (h) =>
          h.name.toLowerCase().includes(search.toLowerCase()) ||
          h.stock_no.toLowerCase().includes(search.toLowerCase()),
      )
    : homes;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: 12 }}>
      <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Home</label>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 12px',
          border: '1px solid var(--adm-line)',
          borderRadius: 'var(--r-1)',
          cursor: 'pointer',
          fontSize: 13,
          background: 'var(--adm-bg)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: selected ? 'var(--adm-ink)' : 'var(--adm-ink-mute)' }}>
          {selected ? `${selected.name} (${selected.stock_no})` : 'Select a home...'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--adm-ink-mute)' }}>{'▼'}</span>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            background: '#fff',
            border: '1px solid var(--adm-line)',
            borderRadius: 'var(--r-1)',
            boxShadow: '0 4px 12px rgba(0,0,0,.12)',
            maxHeight: 240,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or stock #..."
            autoFocus
            style={{
              padding: '8px 12px',
              border: 'none',
              borderBottom: '1px solid var(--adm-line)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <div style={{ overflowY: 'auto', maxHeight: 190 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px', color: 'var(--adm-ink-mute)', fontSize: 12 }}>No homes found</div>
            )}
            {filtered.map((h) => (
              <div
                key={h.id}
                onClick={() => {
                  onChange(h.id);
                  setOpen(false);
                  setSearch('');
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 13,
                  background: h.id === selectedId ? '#f0ebe3' : 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f2ee')}
                onMouseLeave={(e) => (e.currentTarget.style.background = h.id === selectedId ? '#f0ebe3' : 'transparent')}
              >
                <div style={{ fontWeight: 500 }}>{h.name}</div>
                <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>
                  {h.stock_no} &bull; {fmtDollars(h.listed_price_cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PurchaseOrderFormModal({
  leadId,
  orgId,
  homeId: initialHomeId,
  defaultLineItems,
  homes,
  quoteId,
  onClose,
  onCreated,
}: Props) {
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(initialHomeId);
  const [items, setItems] = useState<LineItem[]>(defaultLineItems);
  const [notes, setNotes] = useState<string[]>([
    'This purchase order confirms the home and options agreed to above.',
  ]);
  const [terms, setTerms] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewBytes, setPreviewBytes] = useState<ArrayBuffer | null>(null);

  const selectedHome = homes.find((h) => h.id === selectedHomeId);
  const modalTitle = selectedHome ? `Create Purchase Order — ${selectedHome.name}` : 'Create Purchase Order';

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

  async function handlePreview() {
    if (!selectedHomeId) {
      setErr('Select a home first');
      return;
    }
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      setErr('Add at least one line item');
      return;
    }
    setErr(null);
    setIsPreviewing(true);
    try {
      const res = await fetch('/api/pdf/preview-po', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          homeId: selectedHomeId,
          leadId,
          lineItems: validItems,
          notes: notes.filter((n) => n.trim()),
          terms: terms.trim() || null,
          deliveryDate: deliveryDate || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const arrayBuffer = await res.arrayBuffer();
      setPreviewBytes(arrayBuffer);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  }

  function closePreview() {
    setPreviewBytes(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedHomeId) {
      setErr('Select a home first');
      return;
    }
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      setErr('Add at least one line item');
      return;
    }
    setErr(null);

    startTransition(async () => {
      try {
        const po = await createPurchaseOrder({
          leadId,
          orgId,
          homeId: selectedHomeId,
          quoteId,
          lineItems: validItems,
          notes: notes.filter((n) => n.trim()),
          terms: terms.trim() || null,
          deliveryDate: deliveryDate || null,
          sendEmail,
        });
        onCreated(po.public_token, po.po_number);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Purchase order creation failed');
      }
    });
  }

  // ── Preview view ──────────────────────────────────────────────────────────
  if (previewBytes) {
    return (
      <div className="modal-overlay" onClick={closePreview}>
        <div
          className="modal-content"
          style={{ width: 960, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h3>Preview Purchase Order — {selectedHome?.name ?? 'PO'}</h3>
            <button type="button" className="modal-close" onClick={closePreview}>
              ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PdfCanvasViewer pdfBytes={previewBytes} />
          </div>
          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn-secondary" onClick={closePreview}>
              Back to edit
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const blob = new Blob([previewBytes], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `PO_${selectedHome?.name?.replace(/\s+/g, '_') ?? 'preview'}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={isPending}
                onClick={() => {
                  closePreview();
                  const formEvt = { preventDefault: () => {} } as React.FormEvent;
                  handleSubmit(formEvt);
                }}
              >
                {sendEmail ? 'Send PO' : 'Save PO'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 680, maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{modalTitle}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <HomeSelect homes={homes} selectedId={selectedHomeId} onChange={setSelectedHomeId} />

            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 32px', gap: 8, marginBottom: 6 }}>
                <span className="field-label">Description</span>
                <span className="field-label">Amount</span>
                <span />
              </div>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 32px', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={item.description}
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
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-ink-mute)', fontSize: 16 }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                style={{ background: 'none', border: '1px dashed var(--adm-line)', padding: '6px 12px', fontSize: 12, color: 'var(--adm-accent)', cursor: 'pointer', borderRadius: 'var(--r-1)', width: '100%' }}
              >
                + Add line item
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f6efe6', borderRadius: 'var(--r-1)', marginTop: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--adm-ink-mute)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</span>
              <span style={{ fontSize: 22, fontFamily: 'Georgia, serif', color: '#b9532a', fontWeight: 500 }}>{fmtDollars(total)}</span>
            </div>

            <label className="field">
              <span className="field-label">Delivery Date (optional)</span>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </label>

            <label className="field">
              <span className="field-label">Terms (optional)</span>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="e.g., 50% deposit on signing, balance at delivery. Cancellation policy…"
                rows={3}
              />
            </label>

            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>Notes</span>
              {notes.map((note, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => updateNote(i, e.target.value)}
                    placeholder="Note…"
                    style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid var(--adm-line)', borderRadius: 'var(--r-1)' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeNote(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-ink-mute)', fontSize: 16 }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addNote}
                style={{ background: 'none', border: '1px dashed var(--adm-line)', padding: '6px 12px', fontSize: 12, color: 'var(--adm-accent)', cursor: 'pointer', borderRadius: 'var(--r-1)', width: '100%' }}
              >
                + Add note
              </button>
            </div>

            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Email PO to customer</span>
            </label>

            {err && <div style={{ color: '#a53a2c', fontSize: 13 }}>{err}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="btn-secondary"
              disabled={isPreviewing || isPending}
              onClick={handlePreview}
            >
              {isPreviewing ? 'Generating…' : 'Preview PDF'}
            </button>
            <button type="submit" className="btn-primary" disabled={isPending || isPreviewing}>
              {isPending ? 'Creating…' : sendEmail ? 'Send PO' : 'Save PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
