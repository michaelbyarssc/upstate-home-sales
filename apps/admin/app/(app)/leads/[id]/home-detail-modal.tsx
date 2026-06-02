'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@uhs/db/browser';
import { HOME_PHOTO_BUCKET, formatBedsOrBaths, formatCents, type HomeType } from '@uhs/db';
import type { MatchableHome } from '../../../../lib/match-homes';

type Photo = { id: string; url: string; alt: string | null };

type Props = {
  home: MatchableHome;
  manufacturerName: string | null;
  isAssigned: boolean;
  assigning: boolean;
  /** Public token of the auto-created draft quote, once assigned. */
  quoteToken: string | null;
  onAssign: (homeId: string) => void;
  onClose: () => void;
};

const PUBLIC_BASE = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${HOME_PHOTO_BUCKET}`;

const TYPE_LABEL: Record<HomeType, string> = {
  single: 'Single-wide',
  double: 'Double-wide',
  modular: 'Modular',
};

/**
 * Photo-forward "show the customer" popup for a matched home. Reuses the global
 * modal chrome (.modal-overlay/.modal-content/...). Photos are fetched on open;
 * every other field comes from the match object already in the panel.
 */
export function HomeDetailModal({
  home,
  manufacturerName,
  isAssigned,
  assigning,
  quoteToken,
  onAssign,
  onClose,
}: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // Pull the home's photos (the centerpiece of the popup).
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('home_photos')
      .select('id, storage_path, alt_text, sort_order')
      .eq('home_id', home.id)
      .order('sort_order')
      .then(({ data }) => {
        if (cancelled) return;
        setPhotos(
          (data ?? []).map((p) => ({
            id: p.id,
            url: `${STORAGE_BASE}/${p.storage_path}`,
            alt: p.alt_text,
          })),
        );
        setLoadingPhotos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [home.id]);

  // Close on Escape (the existing modals only close on backdrop/×).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hero = photos[heroIdx] ?? null;
  const dims = home.width_ft && home.length_ft ? `${home.width_ft}′ × ${home.length_ft}′` : '—';

  const specs: Array<[string, string]> = [
    ['Type', home.type ? TYPE_LABEL[home.type] ?? home.type : '—'],
    [
      'Beds / baths',
      `${formatBedsOrBaths(home.beds, home.beds_options)} / ${formatBedsOrBaths(home.baths, home.baths_options)}`,
    ],
    ['Square feet', home.sqft ? home.sqft.toLocaleString() : '—'],
    ['Dimensions', dims],
    ['Year built', home.year_built ? String(home.year_built) : '—'],
    ['Manufacturer', manufacturerName ?? '—'],
    ['Model', home.model ?? '—'],
    ['Stock number', home.stock_no],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 860, maxWidth: '94vw', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{home.name}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {/* ── Gallery ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 10',
                borderRadius: 8,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #e8e0d4, #cdbfa9)',
              }}
            >
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hero.url}
                  alt={hero.alt ?? home.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--adm-ink-mute)',
                    fontSize: 13,
                  }}
                >
                  {loadingPhotos ? 'Loading photos…' : 'No photos yet'}
                </div>
              )}
            </div>

            {photos.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setHeroIdx(i)}
                    style={{
                      width: 64,
                      height: 48,
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: i === heroIdx ? '2px solid var(--adm-accent)' : '1px solid var(--adm-line)',
                      padding: 0,
                      cursor: 'pointer',
                      background: 'none',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.alt ?? ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Price ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ font: '600 22px/1 var(--f-display)', color: 'var(--adm-ink)' }}>
              {home.listed_price_cents != null ? formatCents(home.listed_price_cents) : 'Price on request'}
            </div>
          </div>

          {/* ── Spec grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {specs.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderBottom: '1px solid var(--adm-line)',
                  padding: '7px 0',
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--adm-ink-mute)' }}>{k}</span>
                <span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* ── Headline / description ── */}
          {(home.headline || home.description) && (
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {home.headline && <div style={{ fontWeight: 600, marginBottom: 4 }}>{home.headline}</div>}
              {home.description && (
                <p style={{ margin: 0, color: 'var(--adm-ink-mute)' }}>{home.description}</p>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <a
            className="btn-secondary"
            href={`${PUBLIC_BASE}/inventory/${encodeURIComponent(home.stock_no)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open public listing ↗
          </a>
          {isAssigned && quoteToken && (
            <a
              className="btn-secondary"
              href={`${PUBLIC_BASE}/q/${quoteToken}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View quote ↗
            </a>
          )}
          {isAssigned ? (
            <span
              className="btn-secondary"
              style={{ borderColor: 'var(--adm-accent)', color: 'var(--adm-accent)', cursor: 'default' }}
            >
              ✓ Assigned to lead
            </span>
          ) : (
            <button type="button" className="btn-primary" onClick={() => onAssign(home.id)} disabled={assigning}>
              {assigning ? 'Assigning…' : 'Assign + create quote'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
