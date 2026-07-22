'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  formatCents,
  type ModelOption,
  type ModelOptionValue,
  type OptionOverlay,
} from '@uhs/db';
import { saveDesign } from './actions';
import { HousePreview } from './house-preview';

type Props = {
  homeId: string;
  homeName: string;
  baseListedPriceCents: number | null;
  pricesHidden: boolean;
  options: Array<ModelOption & { values: ModelOptionValue[] }>;
  heroPhotoUrl: string | null;
};

type SelectionMap = Record<string, string>;

export function DesignStudio({
  homeId,
  homeName,
  baseListedPriceCents,
  pricesHidden,
  options,
  heroPhotoUrl,
}: Props) {
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

  const priceLabel =
    pricesHidden || !baseListedPriceCents || baseListedPriceCents <= 0
      ? 'Call for Price'
      : (totalCents != null ? formatCents(totalCents) : '—');

  return (
    <div className="design-grid">
      <div className="design-canvas" style={{ position: 'relative' }}>
        <HousePreview
          heroPhotoUrl={heroPhotoUrl}
          homeName={homeName}
          slotColors={slotColors}
          options={options}
          selections={selections}
        />
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
