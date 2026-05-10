'use client';

import { useEffect, useRef, useState } from 'react';
import { signQuote } from './sign-action';

type Props = {
  token: string;
  brandColor: string | null;
  alreadySigned?: { signer_name: string; signed_at: string } | null;
};

export function SignBlock({ token, brandColor, alreadySigned }: Props) {
  const [open, setOpen] = useState(false);
  const [signed, setSigned] = useState(alreadySigned ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);

  // Resize canvas to fit container width once on open.
  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a1a1a';
    }
  }, [open]);

  function pointFromEvent(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    lastPt.current = pointFromEvent(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx || !lastPt.current) return;
    const pt = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
    dirty.current = true;
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    lastPt.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function clearPad() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, c.width / dpr, c.height / dpr);
    dirty.current = false;
  }

  async function submit() {
    setErr(null);
    if (!name.trim() || !email.trim()) {
      setErr('Please enter your name and email.');
      return;
    }
    if (!dirty.current) {
      setErr('Please sign in the box above.');
      return;
    }
    const c = canvasRef.current;
    if (!c) return;
    setSubmitting(true);
    try {
      const dataUrl = c.toDataURL('image/png');
      const res = await signQuote({
        token,
        signer_name: name.trim(),
        signer_email: email.trim(),
        signature_data_url: dataUrl,
      });
      if (!res.ok) {
        setErr(res.error);
      } else {
        setSigned({ signer_name: name.trim(), signed_at: new Date().toISOString() });
        setOpen(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (signed) {
    return (
      <div
        style={{
          marginTop: 'var(--s-8)',
          padding: 'var(--s-5)',
          background: '#ecf7ed',
          border: '1px solid #b9deba',
          borderRadius: 'var(--r-2)',
          color: '#1d6f3f',
        }}
      >
        <strong>Quote accepted.</strong>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          Signed by {signed.signer_name} on {new Date(signed.signed_at).toLocaleString()}.
        </div>
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--c-ink-soft)' }}>
          Your salesperson will follow up with next steps within one business day.
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{ marginTop: 'var(--s-8)', textAlign: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen(true)}
          style={brandColor ? { background: brandColor, borderColor: brandColor } : undefined}
        >
          Accept &amp; sign this quote
        </button>
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--c-ink-mute)' }}>
          Signing accepts the price as quoted. Your signature is timestamped and emailed to the dealer.
        </p>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,20,20,0.5)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              maxWidth: 520,
              width: '100%',
              borderRadius: 'var(--r-3)',
              padding: 'var(--s-7)',
            }}
          >
            <h2 id="sign-title" style={{ fontFamily: 'var(--f-display)', fontSize: 'var(--t-h2)' }}>
              Accept this quote
            </h2>
            <p style={{ marginTop: 6, fontSize: 13, color: 'var(--c-ink-mute)' }}>
              Sign with your finger, stylus, or trackpad. Type your name as it should appear on the contract.
            </p>

            <div className="field" style={{ marginTop: 16 }}>
              <label className="label" htmlFor="sg-name">Full legal name</label>
              <input
                className="input"
                id="sg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marlena Pope"
                autoComplete="name"
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label" htmlFor="sg-email">Email</label>
              <input
                className="input"
                id="sg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marlena@example.com"
                autoComplete="email"
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="label" style={{ display: 'block', marginBottom: 4 }}>
                Signature
              </label>
              <canvas
                ref={canvasRef}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 160,
                  background: '#fafaf6',
                  border: '1px dashed var(--c-line)',
                  borderRadius: 'var(--r-2)',
                  touchAction: 'none',
                  cursor: 'crosshair',
                }}
              />
              <button
                type="button"
                onClick={clearPad}
                style={{
                  marginTop: 6,
                  background: 'none',
                  border: 'none',
                  color: 'var(--c-ink-mute)',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear and start over
              </button>
            </div>

            {err && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: '#faf0ee',
                  border: '1px solid #e0c0bc',
                  color: '#a53a2c',
                  fontSize: 13,
                  borderRadius: 4,
                }}
              >
                {err}
              </div>
            )}

            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={submitting}
                style={brandColor ? { background: brandColor, borderColor: brandColor } : undefined}
              >
                {submitting ? 'Submitting…' : 'Accept & sign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
