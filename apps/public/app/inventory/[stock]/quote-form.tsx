'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { formatCents } from '@uhs/db';
import { getAttribution } from '../../../lib/attribution';
import { formatCompactPrice, formatMonthly } from '../../../lib/finance';

type Props = {
  homeId: string;
  homeName: string;
  stockNo: string;
  listedPriceCents: number | null;
  startingFrom: boolean;
  pricesHidden?: boolean;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  widthFt?: number | null;
  lengthFt?: number | null;
  manufacturerName: string | null;
  modelName: string | null;
  heroUrl: string | null;
};

export function QuoteForm({
  homeId,
  homeName,
  stockNo,
  listedPriceCents,
  startingFrom,
  pricesHidden = false,
  beds,
  baths,
  sqft,
  widthFt = null,
  lengthFt = null,
  manufacturerName,
  modelName,
  heroUrl,
}: Props) {
  const isHidden = pricesHidden || listedPriceCents == null;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setSubmitting(true);
    const form = e.currentTarget;
    try {
      const fd = new FormData(form);
      const first = String(fd.get('first_name') ?? '').trim();
      const last = String(fd.get('last_name') ?? '').trim();
      const body = {
        home_id: homeId,
        stock_no: stockNo,
        contact_name: [first, last].filter(Boolean).join(' '),
        email: String(fd.get('email') ?? '').trim(),
        phone: String(fd.get('phone') ?? '').trim(),
        message: String(fd.get('message') ?? '').trim() || null,
        sms_consent: fd.get('sms_consent') === 'on',
        source: 'quote_form' as const,
        ...(getAttribution() ?? {}),
      };
      if (!body.contact_name || !body.email) {
        throw new Error('Please include your name and email.');
      }

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Submission failed.');
      }

      form.reset();
      setMsg({
        kind: 'success',
        text: 'Thanks — we\'ll send a written quote within one business day.',
      });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  const specsLine = [
    beds != null ? `${beds} bed` : null,
    baths != null ? `${baths} bath` : null,
    sqft ? `${sqft.toLocaleString()} sq ft` : null,
    modelName && manufacturerName ? `${modelName} by ${manufacturerName}` : manufacturerName,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div className="summary-card">
        <h3>{homeName}</h3>

        {isHidden ? (
          <div style={{ marginTop: 2, marginBottom: 4 }}>
            <span style={{ font: '600 16px/1.3 var(--f-body)', color: 'var(--c-ink)' }}>
              Contact for pricing
            </span>
            <p style={{ fontSize: 12, color: 'var(--c-ink-mute)', marginTop: 4, marginBottom: 0 }}>
              Tap &ldquo;Get a quote&rdquo; below — we&rsquo;ll send a written number within one business day.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              fontVariantNumeric: 'tabular-nums', marginTop: 2, marginBottom: 4,
            }}>
              <span style={{ font: '700 22px/1 var(--f-body)', color: 'var(--c-ink)' }}>
                {startingFrom ? 'From ' : ''}{formatCompactPrice(listedPriceCents)}
              </span>
              <span style={{ color: 'var(--c-ink-mute)', fontSize: 13 }}>|</span>
              <span style={{ font: '500 14px/1 var(--f-body)', color: 'var(--c-ink-mute)' }}>
                {formatMonthly(listedPriceCents)}
              </span>
            </div>
            <Link
              href={`/financing?price=${Math.round((listedPriceCents ?? 0) / 100)}`}
              style={{ fontSize: 12, color: 'var(--c-accent)', textDecorationColor: 'var(--c-accent)' }}
            >
              Run a full payment estimate →
            </Link>
          </>
        )}

        <ul className="bullets">
          {beds != null && (
            <li><span className="icon" aria-hidden>🛏</span>{beds} bedroom{beds === 1 ? '' : 's'}</li>
          )}
          {baths != null && (
            <li><span className="icon" aria-hidden>🛁</span>{baths} bathroom{baths === 1 ? '' : 's'}</li>
          )}
          {sqft != null && (
            <li><span className="icon" aria-hidden>↔</span>{sqft.toLocaleString()} sq. ft.</li>
          )}
          {widthFt && lengthFt && (
            <li><span className="icon" aria-hidden>▭</span>{widthFt}&prime; × {lengthFt}&prime;</li>
          )}
          <li><span className="icon" aria-hidden>#</span>Stock {stockNo}</li>
        </ul>

        <div className="row">
          <button type="button" className="btn-out" onClick={() => setOpen(true)}>
            Get a quote
          </button>
          <Link href="/contact" className="btn-out">
            Schedule a tour
          </Link>
        </div>

        <a href="#design" className="btn-primary-full">
          Design home
        </a>

        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--c-ink-mute)', lineHeight: 1.5 }}>
          Monthly est. assumes 10% down, 7% APR, 20-year chattel. Real rate set after pre-qual.
        </div>
      </div>

      <div
        className={`modal-overlay${open ? ' open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      >
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="qf-title">
          <aside className="modal-aside">
            <div
              className="photo"
              style={
                heroUrl
                  ? { backgroundImage: `url(${heroUrl})` }
                  : { background: 'linear-gradient(160deg, #b8a384 0%, #5e4f3a 100%)' }
              }
            />
            <span className="eyebrow">You&rsquo;re requesting a quote for</span>
            <h3>{homeName}</h3>
            {specsLine && <div className="specs">{specsLine}</div>}
            <div className="price">
              {isHidden ? 'Contact for pricing' : formatCents(listedPriceCents)}
            </div>
            <div className="caveat">
              {isHidden
                ? 'Final quote will itemize home, delivery, site prep, and any options.'
                : `${startingFrom ? 'Starting price. ' : ''}Final quote will itemize delivery, site prep, and any options.`}
            </div>
            <div className="promise">
              <strong>Our quote promise:</strong>
              <br />
              We respond within 24 business hours with a full itemized quote — no phone tag, no pressure follow-ups.
            </div>
          </aside>

          <form className="modal-form" onSubmit={handleSubmit}>
            <button type="button" className="close" onClick={() => setOpen(false)} aria-label="Close">×</button>
            <span className="eyebrow">5 fields · 30 seconds</span>
            <h2 id="qf-title">Get an itemized quote</h2>
            <p className="sub">
              We&rsquo;ll email you a real quote within 24 hours: home + delivery + site prep, line-itemed.
            </p>

            <div className="field-row">
              <div className="field">
                <label className="label" htmlFor="qf-first">First name</label>
                <input className="input" id="qf-first" name="first_name" placeholder="Marlena" required autoComplete="given-name" />
              </div>
              <div className="field">
                <label className="label" htmlFor="qf-last">Last name</label>
                <input className="input" id="qf-last" name="last_name" placeholder="Pope" autoComplete="family-name" />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="qf-email">Email</label>
              <input className="input" id="qf-email" name="email" type="email" placeholder="marlena@example.com" required autoComplete="email" />
            </div>

            <div className="field">
              <label className="label" htmlFor="qf-phone">Phone (optional)</label>
              <input className="input" id="qf-phone" name="phone" type="tel" placeholder="(803) 555-1234" autoComplete="tel" />
            </div>

            <div className="field">
              <label className="label" htmlFor="qf-msg">Anything we should know?</label>
              <textarea className="textarea" id="qf-msg" name="message" rows={3} placeholder="Trade-in, financing pre-qual, timing — anything." />
            </div>

            <label className="consent">
              <input type="checkbox" name="sms_consent" />
              <span>
                I agree to receive text messages about my inquiry. Msg &amp; data rates may apply.
                Reply STOP to opt out.
              </span>
            </label>

            <div className="submit-row">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send my quote'}
              </button>
            </div>

            <p className="legal">
              By submitting you agree to our privacy policy. We don&rsquo;t sell or share your info — only the salesperson assigned to your quote uses it.
            </p>

            {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}
          </form>
        </div>
      </div>
    </>
  );
}
