'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import type { LineItem } from '@uhs/db';
import { createQuote } from './actions';

type Props = {
  leadId: string;
  orgId: string;
  homeId: string;
  homeName: string;
  defaultLineItems: LineItem[];
  onClose: () => void;
  onCreated: (token: string) => void;
};

const VALIDITY_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
];

function fmtDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function centsToDisplay(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

type PricingMode = 'flat' | 'itemized';

// ── PDF Canvas Viewer (uses PDF.js) ────────────────────────────────────────
function PdfCanvasViewer({ pdfBytes }: { pdfBytes: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes).slice() }).promise;
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';
        const scale = 1.5;

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          if (pageNum > 1) canvas.style.marginTop = '12px';

          containerRef.current.appendChild(canvas);

          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : 'Failed to render PDF');
          setStatus('error');
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  return (
    <div style={{ overflowY: 'auto', maxHeight: '70vh', background: '#e8e4de', padding: '16px 24px' }}>
      {status === 'loading' && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--adm-ink-mute)', fontSize: 13 }}>
          Rendering preview...
        </div>
      )}
      {status === 'error' && (
        <div style={{ textAlign: 'center', padding: 40, color: '#a53a2c', fontSize: 13 }}>
          {errMsg}
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}

// ── Amount Input (edits raw text, parses on blur) ──────────────────────────
function AmountInput({
  cents,
  onChange,
  placeholder,
}: {
  cents: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const isEditing = raw !== null;

  function handleFocus() {
    setRaw(centsToDisplay(cents));
  }

  function handleChange(value: string) {
    // Allow digits, dots, and empty
    setRaw(value.replace(/[^0-9.]/g, ''));
  }

  function handleBlur() {
    if (raw != null) {
      const trimmed = raw.trim();
      if (trimmed === '') {
        onChange(null);
      } else {
        const parsed = parseFloat(trimmed);
        onChange(isNaN(parsed) ? null : Math.round(parsed * 100));
      }
    }
    setRaw(null);
  }

  return (
    <input
      type="text"
      value={isEditing ? raw : centsToDisplay(cents)}
      onFocus={handleFocus}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder ?? 'Included'}
      style={{
        padding: '7px 10px',
        fontSize: 13,
        border: '1px solid var(--adm-line)',
        borderRadius: 'var(--r-1)',
        textAlign: 'right',
      }}
    />
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────
export function QuoteFormModal({
  leadId,
  orgId,
  homeId,
  homeName,
  defaultLineItems,
  onClose,
  onCreated,
}: Props) {
  const [items, setItems] = useState<LineItem[]>(defaultLineItems);
  const [pricingMode, setPricingMode] = useState<PricingMode>('flat');
  const [notes, setNotes] = useState<string[]>([
    'Turn-key price includes: home, shipping, setup, porches, septic, power pole, sewer & water hook-up, water line, underpinning, and HVAC.',
    'Customer will supply the land. If approved, land can be rolled into the loan.',
    'All prices subject to change. This quote is valid for the period stated above.',
  ]);
  const [validDays, setValidDays] = useState(30);
  const [sendEmail, setSendEmail] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewBytes, setPreviewBytes] = useState<ArrayBuffer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const total = items.reduce((s, i) => s + (i.amount_cents ?? 0), 0);

  function switchPricingMode(mode: PricingMode) {
    if (mode === pricingMode) return;
    setPricingMode(mode);
    if (mode === 'itemized') {
      // Switch to itemized: keep existing prices, clear nulls to 0 so user fills them in
      setItems((prev) =>
        prev.map((item) =>
          item.amount_cents == null ? { ...item, amount_cents: 0 } : item,
        ),
      );
    } else {
      const currentTotal = items.reduce((s, i) => s + (i.amount_cents ?? 0), 0);
      setItems((prev) =>
        prev.map((item, i) => ({
          ...item,
          amount_cents: i === 0 ? currentTotal : null,
        })),
      );
    }
  }

  function updateItemDesc(index: number, value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, description: value } : item)));
  }

  function updateItemAmount(index: number, cents: number | null) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, amount_cents: cents } : item)));
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
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      setErr('Add at least one line item');
      return;
    }
    setErr(null);
    setIsPreviewing(true);
    try {
      const res = await fetch('/api/pdf/preview-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          homeId,
          leadId,
          validDays,
          lineItems: validItems,
          notes: notes.filter((n) => n.trim()),
          pricingMode,
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
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      setErr('Add at least one line item');
      return;
    }
    setErr(null);

    startTransition(async () => {
      try {
        const q = await createQuote({
          leadId,
          orgId,
          homeId,
          validDays,
          lineItems: validItems,
          notes: notes.filter((n) => n.trim()),
          sendEmail,
        });
        onCreated(q.public_token);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Quote creation failed');
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
            <h3>Preview Quote — {homeName}</h3>
            <button type="button" className="modal-close" onClick={closePreview}>
              ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PdfCanvasViewer pdfBytes={previewBytes} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={closePreview}>
              ← Back to editor
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={isPending}
              onClick={() => {
                closePreview();
                const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                handleSubmit(fakeEvent);
              }}
            >
              {isPending ? 'Creating…' : sendEmail ? 'Send Quote' : 'Save Quote'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 680, maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Create Quote — {homeName}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {/* Pricing mode toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
              {(['flat', 'itemized'] as PricingMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => switchPricingMode(mode)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    border: '1px solid var(--adm-line)',
                    borderRight: mode === 'flat' ? 'none' : undefined,
                    borderRadius: mode === 'flat' ? 'var(--r-1) 0 0 var(--r-1)' : '0 var(--r-1) var(--r-1) 0',
                    background: pricingMode === mode ? '#b9532a' : 'var(--adm-bg)',
                    color: pricingMode === mode ? '#fff' : 'var(--adm-ink-mute)',
                  }}
                >
                  {mode === 'flat' ? 'Flat Rate' : 'Itemized'}
                </button>
              ))}
            </div>

            {/* Line items */}
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 32px',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span className="field-label">Description</span>
                <span className="field-label">Amount</span>
                <span />
              </div>
              {items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 120px 32px',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItemDesc(i, e.target.value)}
                    placeholder="Item description"
                    style={{
                      padding: '7px 10px',
                      fontSize: 13,
                      border: '1px solid var(--adm-line)',
                      borderRadius: 'var(--r-1)',
                    }}
                  />
                  <AmountInput
                    cents={item.amount_cents}
                    onChange={(cents) => updateItemAmount(i, cents)}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--adm-ink-mute)',
                      fontSize: 16,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                style={{
                  background: 'none',
                  border: '1px dashed var(--adm-line)',
                  padding: '6px 12px',
                  fontSize: 12,
                  color: 'var(--adm-accent)',
                  cursor: 'pointer',
                  borderRadius: 'var(--r-1)',
                  width: '100%',
                }}
              >
                + Add option
              </button>
            </div>

            {/* Running total */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: '#f6efe6',
                borderRadius: 'var(--r-1)',
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--adm-ink-mute)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total
              </span>
              <span style={{ fontSize: 22, fontFamily: 'Georgia, serif', color: '#b9532a', fontWeight: 500 }}>
                {fmtDollars(total)}
              </span>
            </div>

            {/* Notes */}
            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>Notes</span>
              {notes.map((note, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => updateNote(i, e.target.value)}
                    placeholder="Note…"
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      fontSize: 13,
                      border: '1px solid var(--adm-line)',
                      borderRadius: 'var(--r-1)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeNote(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--adm-ink-mute)',
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addNote}
                style={{
                  background: 'none',
                  border: '1px dashed var(--adm-line)',
                  padding: '6px 12px',
                  fontSize: 12,
                  color: 'var(--adm-accent)',
                  cursor: 'pointer',
                  borderRadius: 'var(--r-1)',
                  width: '100%',
                }}
              >
                + Add note
              </button>
            </div>

            {/* Options */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="field-label">Valid For</span>
                <select
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value))}
                >
                  {VALIDITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="field"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}
              >
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>Email quote to customer</span>
              </label>
            </div>

            {err && <div style={{ color: '#a53a2c', fontSize: 13 }}>{err}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isPreviewing || isPending}
                onClick={handlePreview}
              >
                {isPreviewing ? 'Generating…' : 'Preview PDF'}
              </button>
              <button type="submit" className="btn-primary" disabled={isPending || isPreviewing}>
                {isPending ? 'Creating…' : sendEmail ? 'Send Quote' : 'Save Quote'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
