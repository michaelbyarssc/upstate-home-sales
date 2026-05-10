'use client';

import { useState, useTransition } from 'react';
import { formatCents, type ModelOption, type ModelOptionValue, type OptionCategory, type OptionOverlay } from '@uhs/db';
import {
  createOption,
  deleteOption,
  createValue,
  deleteValue,
  setDefaultValue,
} from './actions';

type OptionWithValues = ModelOption & { values: ModelOptionValue[] };

const CATEGORIES: OptionCategory[] = ['exterior', 'kitchen', 'bath', 'flooring', 'misc'];

export function OptionsManager({ homeModelId, initialOptions }: {
  homeModelId: string;
  initialOptions: OptionWithValues[];
}) {
  const [options, setOptions] = useState<OptionWithValues[]>(initialOptions);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // New option form.
  const [newSlot, setNewSlot] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState<OptionCategory>('exterior');
  const [newRequired, setNewRequired] = useState(false);

  function addOption(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlot.trim() || !newLabel.trim()) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const opt = await createOption({
          homeModelId,
          slotName: newSlot,
          label: newLabel,
          category: newCategory,
          required: newRequired,
        });
        setOptions((prev) => [...prev, { ...opt, values: [] }]);
        setNewSlot(''); setNewLabel(''); setNewRequired(false);
        setMsg({ kind: 'success', text: `Added option "${opt.label}"` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Add failed' });
      }
    });
  }

  function rmOption(opt: OptionWithValues) {
    if (!confirm(`Delete "${opt.label}" and its ${opt.values.length} value(s)?`)) return;
    startTransition(async () => {
      try {
        await deleteOption(opt.id, homeModelId);
        setOptions((prev) => prev.filter((o) => o.id !== opt.id));
        setMsg({ kind: 'success', text: `Deleted ${opt.label}` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Delete failed' });
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
      {/* Existing options */}
      {options.length === 0 ? (
        <div className="card" style={{ padding: 16, color: 'var(--adm-ink-mute)' }}>
          No options yet. Add one below to start building this model&rsquo;s configurator.
        </div>
      ) : (
        options.map((opt) => (
          <OptionPanel
            key={opt.id}
            option={opt}
            homeModelId={homeModelId}
            pending={pending}
            startTransition={startTransition}
            onValueAdded={(v) => {
              setOptions((prev) => prev.map((o) => o.id === opt.id ? { ...o, values: [...o.values, v] } : o));
            }}
            onValueDeleted={(vid) => {
              setOptions((prev) => prev.map((o) => o.id === opt.id
                ? { ...o, values: o.values.filter((v) => v.id !== vid) }
                : o));
            }}
            onValueDefaultChanged={(vid) => {
              setOptions((prev) => prev.map((o) => o.id === opt.id
                ? { ...o, values: o.values.map((v) => ({ ...v, is_default: v.id === vid })) }
                : o));
            }}
            onDelete={() => rmOption(opt)}
          />
        ))
      )}

      {/* Add new option */}
      <section className="card">
        <div className="card-head">
          <h3>Add option slot</h3>
          <div className="sub">A slot is one customizable area (e.g., siding color). Pick its values below after adding.</div>
        </div>
        <form className="card-body" onSubmit={addOption}>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Slot name</label>
              <input className="input" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} placeholder="siding_main" />
              <div className="help">Lowercase + underscores. Must match a key in the GLB&rsquo;s material_manifest.</div>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Label</label>
              <input className="input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Siding color" />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Category</label>
              <select className="input" value={newCategory} onChange={(e) => setNewCategory(e.target.value as OptionCategory)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingBottom: 12 }}>
                <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />
                Required (no skip)
              </label>
            </div>
          </div>
          {msg && (
            <div style={{
              padding: 10, borderRadius: 4, fontSize: 13, marginTop: 8,
              background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
              color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
            }}>{msg.text}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="submit" disabled={pending} style={{
              background: 'var(--adm-accent)', color: '#fff', border: 'none',
              padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            }}>
              {pending ? 'Adding…' : 'Add slot'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function OptionPanel({ option, homeModelId, pending, startTransition, onValueAdded, onValueDeleted, onValueDefaultChanged, onDelete }: {
  option: OptionWithValues;
  homeModelId: string;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onValueAdded: (v: ModelOptionValue) => void;
  onValueDeleted: (id: string) => void;
  onValueDefaultChanged: (id: string) => void;
  onDelete: () => void;
}) {
  const [valName, setValName] = useState('');
  const [valLabel, setValLabel] = useState('');
  const [color, setColor] = useState('#cbb89a');
  const [delta, setDelta] = useState(0);
  const [isDefault, setIsDefault] = useState(option.values.length === 0);
  const [err, setErr] = useState<string | null>(null);

  function addValue(e: React.FormEvent) {
    e.preventDefault();
    if (!valName.trim() || !valLabel.trim()) return;
    setErr(null);
    startTransition(async () => {
      try {
        const v = await createValue({
          optionId: option.id,
          homeModelId,
          valueName: valName,
          label: valLabel,
          colorHex: color,
          priceDeltaCents: Math.round(delta * 100),
          isDefault,
        });
        onValueAdded(v);
        setValName(''); setValLabel(''); setDelta(0); setIsDefault(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Add failed');
      }
    });
  }

  return (
    <section className="card">
      <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3>{option.label}</h3>
          <div className="sub">
            slot: <code>{option.slot_name}</code> · {option.category}
            {option.required && <> · <span style={{ color: 'var(--adm-accent)' }}>required</span></>}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          style={{
            background: 'transparent', border: '1px solid #a53a2c', color: '#a53a2c',
            padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
          }}
        >
          Delete slot
        </button>
      </div>
      <div className="card-body">
        {/* Value list */}
        {option.values.length === 0 ? (
          <div style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginBottom: 12 }}>
            No values yet. Add one below.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 6 }}>
            {option.values.map((v) => {
              const ov = v.overlay as OptionOverlay;
              const swatchColor = ov && ov.type === 'color' ? ov.color : null;
              return (
                <li key={v.id} style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr auto auto auto', gap: 10,
                  alignItems: 'center', padding: '6px 8px', background: '#FAF4EB', borderRadius: 4,
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 3,
                    background: swatchColor ?? '#ccc', border: '1px solid rgba(0,0,0,0.1)',
                  }} />
                  <span style={{ fontSize: 13 }}>
                    <strong>{v.label}</strong>
                    <span style={{ color: 'var(--adm-ink-mute)', marginLeft: 6, fontSize: 12 }}>
                      <code>{v.value_name}</code>
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--adm-ink-mute)', fontVariantNumeric: 'tabular-nums' }}>
                    {v.price_delta_cents !== 0
                      ? `${v.price_delta_cents > 0 ? '+' : ''}${formatCents(v.price_delta_cents)}`
                      : '—'}
                  </span>
                  {v.is_default ? (
                    <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--adm-accent)', color: '#fff', borderRadius: 3 }}>
                      Default
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startTransition(async () => {
                        try {
                          await setDefaultValue(v.id, option.id, homeModelId);
                          onValueDefaultChanged(v.id);
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : 'Failed');
                        }
                      })}
                      style={{
                        background: 'transparent', border: '1px solid #C5B79F',
                        padding: '2px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
                      }}
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Delete "${v.label}"?`)) return;
                      startTransition(async () => {
                        try {
                          await deleteValue(v.id, homeModelId);
                          onValueDeleted(v.id);
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : 'Failed');
                        }
                      });
                    }}
                    style={{
                      background: 'transparent', border: 'none', color: '#a53a2c',
                      fontSize: 11, cursor: 'pointer', padding: '2px 6px',
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Add value form */}
        <form onSubmit={addValue} style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px 80px auto', gap: 8,
          alignItems: 'center', padding: '10px 12px', background: '#fff',
          border: '1px dashed var(--adm-line, #e5dfd1)', borderRadius: 4,
        }}>
          <input className="input" value={valName} onChange={(e) => setValName(e.target.value)} placeholder="value_name" style={{ fontSize: 12, padding: '6px 8px' }} />
          <input className="input" value={valLabel} onChange={(e) => setValLabel(e.target.value)} placeholder="Display label" style={{ fontSize: 12, padding: '6px 8px' }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 80, height: 32, padding: 0, border: '1px solid var(--adm-line, #e5dfd1)', borderRadius: 4 }} />
          <input
            className="input" type="number" step={50} value={delta}
            onChange={(e) => setDelta(Number(e.target.value || 0))}
            placeholder="$ delta"
            style={{ fontSize: 12, padding: '6px 8px' }}
          />
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            default
          </label>
          <button type="submit" disabled={pending} style={{
            background: 'var(--adm-accent)', color: '#fff', border: 'none',
            padding: '6px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
          }}>
            Add
          </button>
        </form>
        {err && (
          <div style={{ marginTop: 8, color: '#a53a2c', fontSize: 12 }}>{err}</div>
        )}
      </div>
    </section>
  );
}
