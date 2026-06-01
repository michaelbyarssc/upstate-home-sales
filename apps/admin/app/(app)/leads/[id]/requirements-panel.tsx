'use client';

import { useState } from 'react';
import { formatCents, type FinancingPref, type HomeType, type LandStatus, type LeadPreferences, type LeadPreferencesInput, type RequirementTimeline } from '@uhs/db';
import type { HomeMatch } from '../../../../lib/match-homes';
import {
  assignHomeToLead,
  findMatchingHomes,
  saveLeadPreferences,
  suggestHomeForLead,
} from './actions';

type ManufacturerOption = { id: string; name: string };

type Props = {
  leadId: string;
  initialPreferences: LeadPreferences | null;
  manufacturers: ManufacturerOption[];
  initialMatches: HomeMatch[];
  assignedHomeId: string | null;
  buyerLinked: boolean;
};

const TYPE_OPTIONS: Array<{ value: HomeType; label: string }> = [
  { value: 'single', label: 'Single-wide' },
  { value: 'double', label: 'Double-wide' },
  { value: 'modular', label: 'Modular' },
];

const TIMELINE_OPTIONS: Array<{ value: RequirementTimeline; label: string }> = [
  { value: 'asap', label: 'ASAP' },
  { value: '1_3_months', label: '1–3 months' },
  { value: '3_6_months', label: '3–6 months' },
  { value: '6_12_months', label: '6–12 months' },
  { value: 'exploring', label: 'Just exploring' },
];

const LAND_OPTIONS: Array<{ value: LandStatus; label: string }> = [
  { value: 'owns_land', label: 'Owns land' },
  { value: 'needs_land', label: 'Needs land' },
  { value: 'in_park', label: 'In a park / community' },
  { value: 'unsure', label: 'Unsure' },
];

const FINANCING_OPTIONS: Array<{ value: FinancingPref; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'financing', label: 'Financing' },
  { value: 'unsure', label: 'Unsure' },
];

const FEATURE_SUGGESTIONS = [
  'Island kitchen', 'Walk-in closet', 'Garden tub', 'Drywall finish', 'Fireplace',
  'Front porch', 'Covered deck', 'Office / flex room', 'Open floor plan', 'Mudroom',
  'Stainless appliances', 'Split floor plan',
];

const EMPTY: LeadPreferencesInput = {
  preferred_types: null,
  manufacturer_ids: null,
  preferred_models: null,
  min_beds: null, max_beds: null,
  min_baths: null, max_baths: null,
  min_sqft: null, max_sqft: null,
  min_width_ft: null, max_width_ft: null,
  min_length_ft: null, max_length_ft: null,
  min_year: null, max_year: null,
  min_price_cents: null, max_price_cents: null,
  must_have_features: null,
  nice_to_have_features: null,
  timeline: null,
  land_status: null,
  financing: null,
  trade_in_interest: false,
  notes: null,
};

function toForm(p: LeadPreferences | null): LeadPreferencesInput {
  if (!p) return { ...EMPTY };
  return {
    preferred_types: p.preferred_types,
    manufacturer_ids: p.manufacturer_ids,
    preferred_models: p.preferred_models,
    min_beds: p.min_beds, max_beds: p.max_beds,
    min_baths: p.min_baths, max_baths: p.max_baths,
    min_sqft: p.min_sqft, max_sqft: p.max_sqft,
    min_width_ft: p.min_width_ft, max_width_ft: p.max_width_ft,
    min_length_ft: p.min_length_ft, max_length_ft: p.max_length_ft,
    min_year: p.min_year, max_year: p.max_year,
    min_price_cents: p.min_price_cents, max_price_cents: p.max_price_cents,
    must_have_features: p.must_have_features,
    nice_to_have_features: p.nice_to_have_features,
    timeline: p.timeline,
    land_status: p.land_status,
    financing: p.financing,
    trade_in_interest: p.trade_in_interest,
    notes: p.notes,
  };
}

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const centsToDollars = (c: number | null): string => (c == null ? '' : String(c / 100));
const dollarsToCents = (s: string): number | null => {
  const n = numOrNull(s);
  return n == null ? null : Math.round(n * 100);
};

function toggleInArray<T>(arr: T[] | null, v: T): T[] | null {
  const cur = arr ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : null;
}

export function RequirementsPanel({
  leadId,
  initialPreferences,
  manufacturers,
  initialMatches,
  assignedHomeId: initialAssigned,
  buyerLinked,
}: Props) {
  const [form, setForm] = useState<LeadPreferencesInput>(toForm(initialPreferences));
  const [matches, setMatches] = useState<HomeMatch[]>(initialMatches);
  const [assignedHomeId, setAssignedHomeId] = useState<string | null>(initialAssigned);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyHome, setBusyHome] = useState<string | null>(null);

  function set<K extends keyof LeadPreferencesInput>(key: K, val: LeadPreferencesInput[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    setSaved(false);
  }

  async function refreshMatches() {
    setRefreshing(true);
    try {
      setMatches(await findMatchingHomes(leadId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not refresh matches');
    } finally {
      setRefreshing(false);
    }
  }

  async function onSave() {
    setErr(null);
    setSaving(true);
    try {
      const updated = await saveLeadPreferences(leadId, form);
      setForm(toForm(updated));
      setSaved(true);
      await refreshMatches();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save requirements');
    } finally {
      setSaving(false);
    }
  }

  async function onAssign(homeId: string) {
    setErr(null);
    setBusyHome(homeId);
    try {
      await assignHomeToLead(leadId, homeId);
      setAssignedHomeId(homeId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not assign home');
    } finally {
      setBusyHome(null);
    }
  }

  async function onSuggest(homeId: string) {
    setErr(null);
    setBusyHome(homeId);
    try {
      const r = await suggestHomeForLead({ leadId, homeId, note: null });
      if (!r.ok) setErr(r.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not suggest home');
    } finally {
      setBusyHome(null);
    }
  }

  return (
    <section
      style={{ marginTop: 24, background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 20 }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ font: '600 18px/1 var(--f-body)', margin: 0 }}>What they’re looking for</h2>
          <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)', marginTop: 4 }}>
            Log the buyer’s criteria. We rank matching inventory below, and these can flow onto a sales order / contract.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && <span style={{ fontSize: 12, color: '#1c6b35' }}>Saved ✓</span>}
          <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save requirements'}
          </button>
        </div>
      </header>

      {err && <div style={{ background: '#fee', color: '#a00', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="req-grid">
        {/* ── Left column: type, make, features ── */}
        <div>
          <div className="req-block">
            <h3 className="req-h3">Home type</h3>
            <div className="req-checks">
              {TYPE_OPTIONS.map((t) => {
                const on = !!form.preferred_types?.includes(t.value);
                return (
                  <label key={t.value} className={`req-check${on ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set('preferred_types', toggleInArray(form.preferred_types, t.value))}
                    />
                    {t.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="req-block">
            <h3 className="req-h3">Manufacturer</h3>
            <div className="req-checks">
              {manufacturers.map((m) => {
                const on = !!form.manufacturer_ids?.includes(m.id);
                return (
                  <label key={m.id} className={`req-check${on ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set('manufacturer_ids', toggleInArray(form.manufacturer_ids, m.id))}
                    />
                    {m.name}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="req-block">
            <h3 className="req-h3">Preferred models</h3>
            <TagInput
              values={form.preferred_models}
              placeholder="Add a model name and press Enter"
              onChange={(v) => set('preferred_models', v)}
            />
          </div>

          <div className="req-block">
            <h3 className="req-h3">Must-have features (non-negotiables)</h3>
            <TagInput
              values={form.must_have_features}
              placeholder="Add a non-negotiable and press Enter"
              suggestions={FEATURE_SUGGESTIONS}
              onChange={(v) => set('must_have_features', v)}
            />
          </div>

          <div className="req-block">
            <h3 className="req-h3">Nice-to-have features</h3>
            <TagInput
              values={form.nice_to_have_features}
              placeholder="Add a nice-to-have and press Enter"
              suggestions={FEATURE_SUGGESTIONS}
              onChange={(v) => set('nice_to_have_features', v)}
            />
          </div>
        </div>

        {/* ── Right column: size, budget, context ── */}
        <div>
          <div className="req-block">
            <h3 className="req-h3">Size &amp; layout</h3>
            <RangeRow label="Beds" min={form.min_beds} max={form.max_beds}
              onMin={(v) => set('min_beds', v)} onMax={(v) => set('max_beds', v)} />
            <RangeRow label="Baths" step={0.5} min={form.min_baths} max={form.max_baths}
              onMin={(v) => set('min_baths', v)} onMax={(v) => set('max_baths', v)} />
            <RangeRow label="Sq ft" min={form.min_sqft} max={form.max_sqft}
              onMin={(v) => set('min_sqft', v)} onMax={(v) => set('max_sqft', v)} />
            <RangeRow label="Width (ft)" min={form.min_width_ft} max={form.max_width_ft}
              onMin={(v) => set('min_width_ft', v)} onMax={(v) => set('max_width_ft', v)} />
            <RangeRow label="Length (ft)" min={form.min_length_ft} max={form.max_length_ft}
              onMin={(v) => set('min_length_ft', v)} onMax={(v) => set('max_length_ft', v)} />
            <RangeRow label="Year" min={form.min_year} max={form.max_year}
              onMin={(v) => set('min_year', v)} onMax={(v) => set('max_year', v)} />
          </div>

          <div className="req-block">
            <h3 className="req-h3">Budget ($)</h3>
            <div className="req-range">
              <span>Price</span>
              <input
                type="number" inputMode="numeric" placeholder="Min"
                value={centsToDollars(form.min_price_cents)}
                onChange={(e) => set('min_price_cents', dollarsToCents(e.target.value))}
              />
              <input
                type="number" inputMode="numeric" placeholder="Max"
                value={centsToDollars(form.max_price_cents)}
                onChange={(e) => set('max_price_cents', dollarsToCents(e.target.value))}
              />
            </div>
          </div>

          <div className="req-block">
            <h3 className="req-h3">Context</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="field">
                <span className="field-label">Timeline</span>
                <select value={form.timeline ?? ''} onChange={(e) => set('timeline', (e.target.value || null) as RequirementTimeline | null)}>
                  <option value="">—</option>
                  {TIMELINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Land</span>
                <select value={form.land_status ?? ''} onChange={(e) => set('land_status', (e.target.value || null) as LandStatus | null)}>
                  <option value="">—</option>
                  {LAND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Financing</span>
                <select value={form.financing ?? ''} onChange={(e) => set('financing', (e.target.value || null) as FinancingPref | null)}>
                  <option value="">—</option>
                  {FINANCING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'end', paddingBottom: 8 }}>
                <input type="checkbox" checked={form.trade_in_interest} onChange={(e) => set('trade_in_interest', e.target.checked)} />
                <span className="field-label" style={{ margin: 0 }}>Has a trade-in</span>
              </label>
            </div>
          </div>

          <div className="req-block">
            <h3 className="req-h3">Notes</h3>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
              placeholder="Anything else about what they want…"
              rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--adm-line)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
        </div>
      </div>

      {/* ── Matches ── */}
      <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--adm-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 className="req-h3" style={{ margin: 0 }}>Matching homes ({matches.length})</h3>
          <button type="button" className="req-mini-btn" onClick={refreshMatches} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh matches'}
          </button>
        </div>

        {matches.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)', padding: '14px 0' }}>
            Set some criteria above and Save to see ranked inventory.
          </div>
        ) : (
          <div className="req-matches">
            {matches.map((m) => {
              const isAssigned = m.home.id === assignedHomeId;
              const busy = busyHome === m.home.id;
              return (
                <div key={m.home.id} className={`req-match${isAssigned ? ' assigned' : ''}`}>
                  <div className="topline">
                    <div>
                      <div className="hname">{m.home.name}</div>
                      <div className="hsub">
                        {m.home.stock_no}
                        {m.home.listed_price_cents != null && <> · {formatCents(m.home.listed_price_cents)}</>}
                      </div>
                    </div>
                    <div className="req-score">
                      {m.criteriaCount === 0 ? 'No criteria' : `${Math.round(m.score * 100)}% match`}
                    </div>
                  </div>

                  {(m.matched.length > 0 || m.missed.length > 0) && (
                    <div className="req-chips">
                      {m.matched.map((c) => <span key={`y-${c}`} className="req-pill yes">✓ {c}</span>)}
                      {m.missed.map((c) => <span key={`n-${c}`} className="req-pill no">✗ {c}</span>)}
                    </div>
                  )}

                  {(m.matchedFeatures.length > 0 || m.missedFeatures.length > 0) && (
                    <div className="req-chips">
                      {m.matchedFeatures.map((f) => <span key={`fy-${f}`} className="req-pill yes">✓ {f}</span>)}
                      {m.missedFeatures.map((f) => <span key={`fn-${f}`} className="req-pill no">? {f}</span>)}
                    </div>
                  )}

                  <div className="req-actions-row">
                    {isAssigned ? (
                      <span className="req-mini-btn" style={{ borderColor: 'var(--adm-accent)', color: 'var(--adm-accent)', cursor: 'default' }}>✓ Assigned to lead</span>
                    ) : (
                      <button type="button" className="req-mini-btn primary" onClick={() => onAssign(m.home.id)} disabled={busy}>
                        {busy ? '…' : 'Assign to lead'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="req-mini-btn"
                      onClick={() => onSuggest(m.home.id)}
                      disabled={busy || !buyerLinked}
                      title={buyerLinked ? undefined : 'Buyer must be on the portal first'}
                    >
                      Suggest to buyer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {(form.must_have_features?.length ?? 0) > 0 && (
          <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)', marginTop: 10 }}>
            Feature chips are a soft signal matched against listing text — they don’t filter or change the % score.
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Sub-components ── */

function RangeRow({
  label, min, max, onMin, onMax, step,
}: {
  label: string;
  min: number | null;
  max: number | null;
  onMin: (v: number | null) => void;
  onMax: (v: number | null) => void;
  step?: number;
}) {
  return (
    <div className="req-range">
      <span>{label}</span>
      <input
        type="number" inputMode="decimal" placeholder="Min" step={step}
        value={min ?? ''}
        onChange={(e) => onMin(numOrNull(e.target.value))}
      />
      <input
        type="number" inputMode="decimal" placeholder="Max" step={step}
        value={max ?? ''}
        onChange={(e) => onMax(numOrNull(e.target.value))}
      />
    </div>
  );
}

function TagInput({
  values, onChange, placeholder, suggestions,
}: {
  values: string[] | null;
  onChange: (v: string[] | null) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const list = values ?? [];

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (list.some((x) => x.toLowerCase() === t.toLowerCase())) { setDraft(''); return; }
    onChange([...list, t]);
    setDraft('');
  }
  function remove(v: string) {
    const next = list.filter((x) => x !== v);
    onChange(next.length ? next : null);
  }

  return (
    <div>
      {list.length > 0 && (
        <div className="req-tags">
          {list.map((v) => (
            <span key={v} className="req-tag">
              {v}
              <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="req-tag-add">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(draft); }
          }}
        />
        <button type="button" className="req-mini-btn" onClick={() => add(draft)} disabled={!draft.trim()}>Add</button>
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="req-suggest">
          {suggestions
            .filter((s) => !list.some((x) => x.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <button key={s} type="button" onClick={() => add(s)}>+ {s}</button>
            ))}
        </div>
      )}
    </div>
  );
}
