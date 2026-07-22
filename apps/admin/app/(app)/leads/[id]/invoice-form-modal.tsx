'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import type { LineItem } from '@uhs/db';
import { createClient } from '@uhs/db/browser';
import { createInvoice } from './actions';
import { AmountInput, type HomeOption } from './quote-form-modal';

type Props = {
  leadId: string;
  orgId: string;
  homeId: string | null;
  homeName: string | null;
  defaultLineItems: LineItem[];
  homes: HomeOption[];
  quoteId?: string;
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

// ── Searchable Home Dropdown ───────────────────────────────────────────────
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
        <span style={{ fontSize: 10, color: 'var(--adm-ink-mute)' }}>{'\u25BC'}</span>
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
                  {h.stock_no} &bull; {h.listed_price_cents > 0 ? fmtDollars(h.listed_price_cents) : 'Call for Price'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InvoiceFormModal({
  leadId,
  orgId,
  homeId: initialHomeId,
  homeName: initialHomeName,
  defaultLineItems,
  homes,
  quoteId,
  onClose,
  onCreated,
}: Props) {
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(initialHomeId);
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

  // ── Form 500 / PO details (0043) — prefilled from the lead/home, saved with
  // the invoice and carried onto the PO. ──────────────────────────────────────
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryState, setDeliveryState] = useState('SC');
  const [deliveryZip, setDeliveryZip] = useState('');
  const [mailingSame, setMailingSame] = useState(true);
  const [mailingAddress, setMailingAddress] = useState('');
  const [coBuyerName, setCoBuyerName] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [salesTaxCents, setSalesTaxCents] = useState<number | null>(null);
  const [feesCents, setFeesCents] = useState<number | null>(null);
  const [cashDepositCents, setCashDepositCents] = useState<number | null>(null);
  const [cashAsAgreedCents, setCashAsAgreedCents] = useState<number | null>(null);

  // Prefill PO fields from the lead (address/co-buyer) once on open.
  useEffect(() => {
    const sb = createClient();
    sb.from('leads')
      .select('delivery_address, delivery_city, delivery_state, delivery_zip, mailing_address, co_buyer_name')
      .eq('id', leadId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.delivery_address) setDeliveryAddress(data.delivery_address);
        if (data.delivery_city) setDeliveryCity(data.delivery_city);
        if (data.delivery_state) setDeliveryState(data.delivery_state);
        if (data.delivery_zip) setDeliveryZip(data.delivery_zip);
        if (data.co_buyer_name) setCoBuyerName(data.co_buyer_name);
        if (data.mailing_address) {
          setMailingAddress(data.mailing_address);
          setMailingSame(false);
        }
      });
  }, [leadId]);

  // Prefill the serial # from the selected home.
  useEffect(() => {
    if (!selectedHomeId) return;
    const sb = createClient();
    sb.from('homes')
      .select('serial_no')
      .eq('id', selectedHomeId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.serial_no) setSerialNo(data.serial_no);
      });
  }, [selectedHomeId]);

  const selectedHome = homes.find((h) => h.id === selectedHomeId);
  const modalTitle = selectedHome ? `Create Invoice — ${selectedHome.name}` : 'Create Invoice';

  const total = items.reduce((s, i) => s + (i.amount_cents ?? 0), 0);

  function updateItemDescription(index: number, value: string) {
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
        const inv = await createInvoice({
          leadId,
          orgId,
          homeId: selectedHomeId,
          quoteId,
          lineItems: validItems,
          notes: notes.filter((n) => n.trim()),
          paymentTerms,
          paymentInstructions: paymentInstructions || null,
          dueAt: dueAt || null,
          poDetails: {
            deliveryAddress: deliveryAddress.trim() || null,
            deliveryCity: deliveryCity.trim() || null,
            deliveryState: deliveryState.trim() || null,
            deliveryZip: deliveryZip.trim() || null,
            mailingAddress: mailingSame ? null : mailingAddress.trim() || null,
            coBuyerName: coBuyerName.trim() || null,
            serialNo: serialNo.trim() || null,
            salesTaxCents: salesTaxCents ?? 0,
            feesCents: feesCents ?? 0,
            cashDepositCents: cashDepositCents ?? 0,
            cashAsAgreedCents: cashAsAgreedCents ?? 0,
          },
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
          <h3>{modalTitle}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {/* Home selector */}
            <HomeSelect homes={homes} selectedId={selectedHomeId} onChange={setSelectedHomeId} />

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
                    onChange={(e) => updateItemDescription(i, e.target.value)}
                    placeholder="Item description"
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--adm-line)', borderRadius: 'var(--r-1)' }}
                  />
                  <AmountInput
                    cents={item.amount_cents}
                    onChange={(cents) => updateItemAmount(i, cents)}
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
                placeholder="e.g., Make checks payable to Upstate Home Center LLC…"
                rows={3}
              />
            </label>

            {/* ── Purchase-order details (Form 500) — carried onto the PO ── */}
            <details style={{ border: '1px solid var(--adm-line)', borderRadius: 'var(--r-1)', padding: '8px 12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                Purchase-order details (for the Form 500)
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <label className="field">
                  <span className="field-label">Delivery address</span>
                  <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Street address where the home will be set" />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                  <label className="field"><span className="field-label">City</span>
                    <input type="text" value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} /></label>
                  <label className="field"><span className="field-label">State</span>
                    <input type="text" value={deliveryState} onChange={(e) => setDeliveryState(e.target.value)} /></label>
                  <label className="field"><span className="field-label">ZIP</span>
                    <input type="text" value={deliveryZip} onChange={(e) => setDeliveryZip(e.target.value)} /></label>
                </div>
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={mailingSame} onChange={(e) => setMailingSame(e.target.checked)} />
                  <span style={{ fontSize: 13 }}>Mailing address same as delivery</span>
                </label>
                {!mailingSame && (
                  <label className="field"><span className="field-label">Mailing address</span>
                    <input type="text" value={mailingAddress} onChange={(e) => setMailingAddress(e.target.value)} /></label>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label className="field"><span className="field-label">Co-buyer name</span>
                    <input type="text" value={coBuyerName} onChange={(e) => setCoBuyerName(e.target.value)} placeholder="If two buyers" /></label>
                  <label className="field"><span className="field-label">Serial #</span>
                    <input type="text" value={serialNo} onChange={(e) => setSerialNo(e.target.value)} placeholder="Manufacturer serial" /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label className="field"><span className="field-label">Sales tax</span>
                    <AmountInput cents={salesTaxCents} onChange={setSalesTaxCents} placeholder="$0.00" /></label>
                  <label className="field"><span className="field-label">Fees</span>
                    <AmountInput cents={feesCents} onChange={setFeesCents} placeholder="$0.00" /></label>
                  <label className="field"><span className="field-label">Cash deposit</span>
                    <AmountInput cents={cashDepositCents} onChange={setCashDepositCents} placeholder="$0.00" /></label>
                  <label className="field"><span className="field-label">Cash as agreed</span>
                    <AmountInput cents={cashAsAgreedCents} onChange={setCashAsAgreedCents} placeholder="$0.00" /></label>
                </div>
              </div>
            </details>

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
