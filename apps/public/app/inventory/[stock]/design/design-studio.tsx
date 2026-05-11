'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import {
  formatCents,
  type ModelOption,
  type ModelOptionValue,
  type OptionOverlay,
} from '@uhs/db';
import { saveDesign } from './actions';
import { PhotoMode } from './photo-mode';

// Lazy-load the 3D canvas — heavy R3F + three modules only land in the
// chunk when the user is actually in 3D mode. Low-end mobiles never pay
// the download cost.
const Design3dCanvas = dynamic(() => import('./design-canvas-3d'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
      }}
    >
      Loading 3D scene…
    </div>
  ),
});

type Props = {
  homeId: string;
  homeName: string;
  baseListedPriceCents: number | null;
  pricesHidden: boolean;
  glbUrl: string | null;
  materialManifest: Record<string, string | string[]>;
  options: Array<ModelOption & { values: ModelOptionValue[] }>;
  heroPhotoUrl: string | null;
};

type SelectionMap = Record<string, string>;
type Mode = '3d' | 'photo';

/**
 * Decide which mode to default into based on the device's capability:
 *   - No WebGL2 → photo
 *   - save-data hint set → photo (respect the user's data preference)
 *   - viewport < 768 AND deviceMemory < 4 → photo (heuristic for low-end phones)
 *   - otherwise → 3D
 *
 * We can't read these on the server, so we render in 3D and downgrade on
 * mount if the heuristic says so. The downgrade is instant — the dynamic
 * `Design3dCanvas` import is skipped if we flip before it actually loads.
 */
function detectPreferredMode(): Mode {
  if (typeof window === 'undefined') return '3d';
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2')) return 'photo';
  } catch {
    return 'photo';
  }
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData === true) return 'photo';
  if (conn?.effectiveType && /^(slow-2g|2g)$/i.test(conn.effectiveType)) return 'photo';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (window.innerWidth < 768 && typeof memory === 'number' && memory < 4) return 'photo';
  return '3d';
}

export function DesignStudio({
  homeId,
  homeName,
  baseListedPriceCents,
  pricesHidden,
  glbUrl,
  materialManifest,
  options,
  heroPhotoUrl,
}: Props) {
  // Default to 3D for SSR, then immediately re-check on mount. The brief
  // hydration mismatch is fine — the 3D canvas chunk won't actually start
  // downloading until React's effects flush, and our effect runs first.
  const [mode, setMode] = useState<Mode>('3d');
  const [autoDecided, setAutoDecided] = useState(false);
  useEffect(() => {
    if (autoDecided) return;
    setMode(detectPreferredMode());
    setAutoDecided(true);
  }, [autoDecided]);

  const initialSelections: SelectionMap = useMemo(() => {
    const out: SelectionMap = {};
    for (const opt of options) {
      const def = opt.values.find((v) => v.is_default) ?? opt.values[0];
      if (def) out[opt.id] = def.id;
    }
    return out;
  }, [options]);
  const [selections, setSelections] = useState<SelectionMap>(initialSelections);

  const slotColors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const opt of options) {
      const valId = selections[opt.id];
      if (!valId) continue;
      const val = opt.values.find((v) => v.id === valId);
      if (!val) continue;
      const ov = val.overlay as OptionOverlay;
      if (ov && ov.type === 'color') out[opt.slot_name] = ov.color;
    }
    return out;
  }, [selections, options]);

  const totalCents = useMemo(() => {
    if (baseListedPriceCents == null) return null;
    let sum = baseListedPriceCents;
    for (const opt of options) {
      const valId = selections[opt.id];
      if (!valId) continue;
      const val = opt.values.find((v) => v.id === valId);
      if (val) sum += val.price_delta_cents;
    }
    return sum;
  }, [selections, options, baseListedPriceCents]);

  function pick(optionId: string, valueId: string) {
    setSelections((prev) => ({ ...prev, [optionId]: valueId }));
  }

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const o of options) {
      const cat = o.category || 'misc';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(o);
    }
    return Array.from(map.entries());
  }, [options]);

  const [pending, startTransition] = useTransition();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await saveDesign({
          homeId,
          baseListedPriceCents: baseListedPriceCents ?? 0,
          totalPriceCents: totalCents ?? baseListedPriceCents ?? 0,
          selections: Object.entries(selections).map(([option_id, value_id]) => {
            const opt = options.find((o) => o.id === option_id);
            const val = opt?.values.find((v) => v.id === value_id);
            return {
              option_id,
              value_id,
              snapshot_price_delta_cents: val?.price_delta_cents ?? 0,
            };
          }),
        });
        setShareUrl(res.shareUrl);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  const priceLabel = pricesHidden
    ? 'Contact for pricing'
    : (totalCents != null ? formatCents(totalCents) : '—');

  return (
    <div className="design-grid">
      <div className="design-canvas" style={{ position: 'relative' }}>
        {mode === '3d' ? (
          <Design3dCanvas
            glbUrl={glbUrl}
            slotColors={slotColors}
            materialManifest={materialManifest}
          />
        ) : (
          <PhotoMode
            heroPhotoUrl={heroPhotoUrl}
            homeName={homeName}
            slotColors={slotColors}
            options={options}
            selections={selections}
          />
        )}

        {!glbUrl && mode === '3d' && (
          <div className="design-placeholder-tag">
            Demo mode — no 3D asset uploaded for this model yet. Material swaps still work on the placeholder.
          </div>
        )}

        {/* Mode toggle */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'inline-flex',
            background: 'rgba(20, 20, 20, 0.78)',
            borderRadius: 999,
            padding: 4,
            backdropFilter: 'blur(4px)',
            zIndex: 5,
          }}
        >
          {(['3d', 'photo'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              style={{
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#1a1a1a' : '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {m === '3d' ? '3D' : 'Photo'}
            </button>
          ))}
        </div>
      </div>

      <aside className="design-sidebar">
        <div className="design-price-block">
          <div className="design-price-label">Total</div>
          <div className="design-price-value">{priceLabel}</div>
          <div className="design-price-base" style={{ fontSize: 11, color: 'var(--c-ink-mute)' }}>
            {homeName}
          </div>
        </div>

        {options.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--c-ink-mute)', fontSize: 13 }}>
            No customization options have been configured for this home yet. Visit
            the dealer&rsquo;s catalog to see options once they&rsquo;re published.
          </div>
        ) : (
          byCategory.map(([cat, opts]) => (
            <section key={cat} className="design-cat-block">
              <h3 className="design-cat-label">{cat[0]?.toUpperCase()}{cat.slice(1)}</h3>
              {opts.map((opt) => (
                <div key={opt.id} className="design-option">
                  <div className="design-option-label">
                    {opt.label}
                    {opt.required && <span style={{ color: 'var(--c-brand)', marginLeft: 4 }}>*</span>}
                  </div>
                  <div className="design-option-swatches">
                    {opt.values.map((v) => {
                      const ov = v.overlay as OptionOverlay;
                      const swatchColor = ov && ov.type === 'color' ? ov.color : '#cbb89a';
                      const selected = selections[opt.id] === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => pick(opt.id, v.id)}
                          className={`design-swatch ${selected ? 'is-selected' : ''}`}
                          title={v.label + (v.price_delta_cents !== 0 ? ` (${v.price_delta_cents > 0 ? '+' : ''}${formatCents(v.price_delta_cents)})` : '')}
                        >
                          <span className="design-swatch-color" style={{ background: swatchColor }} />
                          <span className="design-swatch-label">
                            {v.label}
                            {v.price_delta_cents !== 0 && (
                              <span style={{ color: 'var(--c-ink-mute)', fontSize: 11, marginLeft: 4 }}>
                                {v.price_delta_cents > 0 ? '+' : ''}{formatCents(v.price_delta_cents)}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}

        <div className="design-actions">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? 'Saving…' : 'Save & share'}
          </button>
          {shareUrl && (
            <div className="design-share">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copy</button>
            </div>
          )}
          {msg && (
            <div style={{ marginTop: 8, padding: 8, background: '#faf0ee', color: '#a53a2c', fontSize: 12, borderRadius: 4 }}>
              {msg}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
