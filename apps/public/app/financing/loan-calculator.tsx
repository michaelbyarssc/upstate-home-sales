'use client';

import { useMemo, useState } from 'react';
import { monthlyPaymentCents } from '../../lib/finance';

type LoanType = 'chattel' | 'land_home' | 'traditional';
type Mode = 'estimate' | 'afford';

const PRESETS: Record<LoanType, { label: string; apr: number; termYears: number; downPct: number; note: string }> = {
  chattel: {
    label: 'Chattel (home only)',
    apr: 8.0,
    termYears: 20,
    downPct: 3.5,
    note: 'For homes placed on rented land or land you already own. Higher rates, shorter terms.',
  },
  land_home: {
    label: 'Land + Home',
    apr: 7.0,
    termYears: 25,
    downPct: 3.5,
    note: 'Single loan covering both the home and the land. Mid-range rates.',
  },
  traditional: {
    label: 'Traditional mortgage',
    apr: 6.5,
    termYears: 30,
    downPct: 3.5,
    note: 'Conventional loan if the home qualifies as real property on a permanent foundation.',
  },
};

type Props = {
  /** Optional price pre-fill (in dollars) coming from a home card or quote link. */
  initialPrice?: number;
};

export function LoanCalculator({ initialPrice }: Props) {
  const [mode, setMode] = useState<Mode>('estimate');
  const [type, setType] = useState<LoanType>('chattel');
  const [price, setPrice] = useState<number>(initialPrice ?? 120_000);
  const [maxMonthly, setMaxMonthly] = useState<number>(800);
  const [downPct, setDownPct] = useState<number>(PRESETS.chattel.downPct);
  const [apr, setApr] = useState<number>(PRESETS.chattel.apr);
  const [termYears, setTermYears] = useState<number>(PRESETS.chattel.termYears);

  function applyPreset(next: LoanType) {
    setType(next);
    const p = PRESETS[next];
    setApr(p.apr);
    setTermYears(p.termYears);
    setDownPct(p.downPct);
  }

  const result = useMemo(() => {
    const dp = Math.max(0, Math.min(100, downPct)) / 100;
    const aprFrac = Math.max(0, apr) / 100;
    const r = aprFrac / 12;
    const n = Math.max(1, Math.round(termYears * 12));

    if (mode === 'estimate') {
      const priceCents = Math.max(0, Math.round(price * 100));
      const downCents = Math.round(priceCents * dp);
      const principalCents = priceCents - downCents;
      const monthlyCents = monthlyPaymentCents(priceCents, { downPct: dp, apr: aprFrac, termMonths: n });
      const totalPaidCents = monthlyCents * n;
      const totalInterestCents = Math.max(0, totalPaidCents - principalCents);
      return { priceCents, downCents, principalCents, monthlyCents, totalPaidCents, totalInterestCents, n };
    }

    // Afford mode: monthly payment → max principal → max home price (with down).
    const monthlyCents = Math.max(0, Math.round(maxMonthly * 100));
    let principalCents = 0;
    if (monthlyCents > 0) {
      principalCents = r === 0
        ? monthlyCents * n
        : Math.round(monthlyCents * (1 - Math.pow(1 + r, -n)) / r);
    }
    const priceCents = dp < 1 ? Math.round(principalCents / (1 - dp)) : 0;
    const downCents = priceCents - principalCents;
    const totalPaidCents = monthlyCents * n;
    const totalInterestCents = Math.max(0, totalPaidCents - principalCents);
    return { priceCents, downCents, principalCents, monthlyCents, totalPaidCents, totalInterestCents, n };
  }, [mode, price, maxMonthly, downPct, apr, termYears]);

  return (
    <div className="loan-calc">
      <div className="loan-calc-head">
        <div>
          <div className="eyebrow">Loan calculator</div>
          <h2 style={{ marginTop: 6 }}>
            {mode === 'estimate' ? 'Estimate your monthly payment' : 'See what you can afford'}
          </h2>
        </div>
        <div className="loan-calc-types" role="tablist" aria-label="Loan type">
          {(Object.keys(PRESETS) as LoanType[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={type === k}
              className={`loan-type-pill${type === k ? ' active' : ''}`}
              onClick={() => applyPreset(k)}
            >
              {PRESETS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="loan-calc-modes" role="tablist" aria-label="Calculator mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'estimate'}
          className={`loan-mode-pill${mode === 'estimate' ? ' active' : ''}`}
          onClick={() => setMode('estimate')}
        >
          I have a home price in mind
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'afford'}
          className={`loan-mode-pill${mode === 'afford' ? ' active' : ''}`}
          onClick={() => setMode('afford')}
        >
          I have a monthly budget
        </button>
      </div>

      <p className="loan-calc-note">{PRESETS[type].note}</p>

      <div className="loan-calc-grid">
        <div className="loan-calc-inputs">
          {mode === 'estimate' ? (
            <NumField
              id="lc-price"
              label="Home price"
              prefix="$"
              value={price}
              min={10_000}
              max={1_000_000}
              step={1_000}
              onChange={setPrice}
            />
          ) : (
            <NumField
              id="lc-monthly"
              label="Monthly payment you can afford"
              prefix="$"
              value={maxMonthly}
              min={100}
              max={10_000}
              step={25}
              onChange={setMaxMonthly}
            />
          )}
          <DownPaymentField
            pct={downPct}
            price={mode === 'estimate' ? price : Math.round(result.priceCents / 100)}
            principal={Math.round(result.principalCents / 100)}
            mode={mode}
            onChange={setDownPct}
          />
          <RangeField
            id="lc-apr"
            label="Interest rate (APR)"
            value={apr}
            min={1}
            max={15}
            step={0.1}
            unit="%"
            onChange={setApr}
          />
          <RangeField
            id="lc-term"
            label="Term"
            value={termYears}
            min={5}
            max={30}
            step={1}
            unit=" years"
            onChange={setTermYears}
          />
        </div>

        <aside className="loan-calc-output">
          {mode === 'estimate' ? (
            <div className="loan-calc-monthly">
              <div className="lbl">Estimated monthly payment</div>
              <div className="val">{formatUSD(Math.round(result.monthlyCents / 100))}<span className="per">/mo</span></div>
            </div>
          ) : (
            <div className="loan-calc-monthly">
              <div className="lbl">Max home price you can afford</div>
              <div className="val">{formatUSD(Math.round(result.priceCents / 100))}</div>
            </div>
          )}
          <dl className="loan-calc-breakdown">
            {mode === 'afford' && (
              <div><dt>Monthly payment</dt><dd>{formatUSD(Math.round(result.monthlyCents / 100))}/mo</dd></div>
            )}
            <div><dt>Down payment</dt><dd>{formatUSD(Math.round(result.downCents / 100))}</dd></div>
            <div><dt>Loan amount</dt><dd>{formatUSD(Math.round(result.principalCents / 100))}</dd></div>
          </dl>
          <p className="loan-calc-disclaimer">
            Estimate only. Actual rate depends on credit, lender, and the specific home. Pre-qualify with one of the lenders above for a real number.
          </p>
        </aside>
      </div>
    </div>
  );
}

function NumField(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={props.id}>{props.label}</label>
      <div className="loan-num-wrap">
        {props.prefix && <span className="loan-num-prefix">{props.prefix}</span>}
        <input
          id={props.id}
          type="number"
          className="input"
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) props.onChange(n);
          }}
        />
      </div>
    </div>
  );
}

function clampNumber(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function RangeField(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  function commit(raw: string) {
    if (raw === '' || raw === '-' || raw === '.') return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    props.onChange(clampNumber(n, props.min, props.max));
  }
  return (
    <div className="field">
      <div className="loan-range-head">
        <label className="label" htmlFor={`${props.id}-input`}>{props.label}</label>
        <span className="loan-range-input-wrap">
          <input
            id={`${props.id}-input`}
            type="number"
            className="loan-range-input"
            value={props.value}
            min={props.min}
            max={props.max}
            step={props.step}
            onChange={(e) => commit(e.target.value)}
          />
          <span className="loan-range-input-unit">{props.unit}</span>
        </span>
      </div>
      <input
        id={props.id}
        type="range"
        className="loan-range"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label={props.label}
      />
    </div>
  );
}

function DownPaymentField(props: {
  pct: number;
  price: number;
  principal: number;
  mode: 'estimate' | 'afford';
  onChange: (pct: number) => void;
}) {
  // Drafts hold the user's literal keystrokes while an input is focused;
  // we also derive the *other* field live from whichever draft is active
  // so the two stay synced as the user types.
  const [draftPct, setDraftPct] = useState<string | null>(null);
  const [draftDollars, setDraftDollars] = useState<string | null>(null);

  function parseNum(s: string | null): number | null {
    if (s == null || s === '' || s === '-' || s === '.') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function pctFromDollars(d: number): number {
    if (props.mode === 'estimate') {
      if (props.price <= 0) return 0;
      return clampNumber((d / props.price) * 100, 0, 100);
    }
    const newPrice = props.principal + d;
    if (newPrice <= 0) return 0;
    return clampNumber((d / newPrice) * 100, 0, 100);
  }

  function dollarsFromPct(p: number): number {
    if (props.mode === 'estimate') {
      return Math.round(props.price * (p / 100));
    }
    if (p >= 100) return props.principal; // cash-buyer edge; principal is the natural cap in afford mode
    return Math.round((props.principal * p) / (100 - p));
  }

  const draftPctN = parseNum(draftPct);
  const draftDollarsN = parseNum(draftDollars);

  // Pick the active source of truth: whichever input has a parseable draft
  // drives the live derivation of the other. Fall back to props.pct otherwise.
  let effectivePct: number;
  let effectiveDollars: number;
  if (draftDollarsN != null) {
    effectivePct = pctFromDollars(draftDollarsN);
    effectiveDollars = draftDollarsN;
  } else if (draftPctN != null) {
    effectivePct = clampNumber(draftPctN, 0, 100);
    effectiveDollars = dollarsFromPct(effectivePct);
  } else {
    effectivePct = props.pct;
    effectiveDollars = dollarsFromPct(props.pct);
  }

  // Display values: when a draft is set, show the literal string the user
  // typed (avoids snap-back on `.` mid-decimal or trailing zeros).
  const pctDisplay = draftPct ?? String(Math.round(effectivePct * 100) / 100);
  const dollarsDisplay = draftDollars ?? String(effectiveDollars);

  function commitPct(raw: string) {
    if (raw === '' || raw === '-' || raw === '.') {
      props.onChange(0);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    props.onChange(clampNumber(n, 0, 100));
  }
  function commitDollars(raw: string) {
    if (raw === '' || raw === '.') {
      props.onChange(0);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return;
    props.onChange(pctFromDollars(n));
  }

  return (
    <div className="field">
      <div className="loan-range-head">
        <label className="label" htmlFor="lc-down-pct">Down payment</label>
        <div className="loan-range-input-pair">
          <span className="loan-range-input-wrap">
            <input
              id="lc-down-pct"
              type="number"
              className="loan-range-input"
              value={pctDisplay}
              min={0}
              max={100}
              step={0.5}
              onChange={(e) => setDraftPct(e.target.value)}
              onBlur={(e) => {
                commitPct(e.target.value);
                setDraftPct(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitPct((e.target as HTMLInputElement).value);
                  setDraftPct(null);
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <span className="loan-range-input-unit">%</span>
          </span>
          <span className="loan-range-input-wrap">
            <span className="loan-range-input-unit">$</span>
            <input
              id="lc-down-dollars"
              type="number"
              className="loan-range-input loan-range-input-wide"
              value={dollarsDisplay}
              min={0}
              step={500}
              onChange={(e) => setDraftDollars(e.target.value)}
              onBlur={(e) => {
                commitDollars(e.target.value);
                setDraftDollars(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitDollars((e.target as HTMLInputElement).value);
                  setDraftDollars(null);
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </span>
        </div>
      </div>
      <input
        id="lc-down"
        type="range"
        className="loan-range"
        value={props.pct}
        min={0}
        max={100}
        step={0.5}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label="Down payment"
      />
    </div>
  );
}

function formatUSD(dollars: number): string {
  if (!Number.isFinite(dollars) || dollars <= 0) return '$0';
  return '$' + Math.round(dollars).toLocaleString();
}
