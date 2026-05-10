'use client';

import { Suspense, useMemo, useState, useTransition } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import {
  formatCents,
  type ModelOption,
  type ModelOptionValue,
  type OptionOverlay,
} from '@uhs/db';
import { saveDesign } from './actions';

type Props = {
  homeId: string;
  homeName: string;
  baseListedPriceCents: number | null;
  pricesHidden: boolean;
  glbUrl: string | null;
  materialManifest: Record<string, string | string[]>;
  options: Array<ModelOption & { values: ModelOptionValue[] }>;
};

type SelectionMap = Record<string, string>; // option_id → value_id

/**
 * Phase C — Design Studio.
 *
 * Renders a 3D preview of the selected home + a side panel of customizable
 * options. Material swaps apply in real time without re-loading the scene.
 *
 * Architecture:
 *   - When `glbUrl` resolves, we load the asset via GLTFLoader and walk its
 *     scene graph; the materialManifest tells us which mesh corresponds to
 *     each option slot, and we override material color when a value is picked.
 *   - When `glbUrl` is null (no asset uploaded yet), we render a placeholder
 *     cube + ground so the dealer can still demo the configurator end-to-end.
 *   - Save flow: serialize selections → /api/designs (server action) →
 *     returns share token → buyer can revisit at /d/<token>.
 */

function PlaceholderHome({ slotColors }: { slotColors: Record<string, string> }) {
  // Hand-built placeholder shape: a simple house silhouette so the renderer
  // and material-swap pipeline can be exercised without a real GLB.
  // Slot names match the conventional siding/trim/roof names in the spec.
  const sidingColor = slotColors['siding_main'] ?? '#cbb89a';
  const trimColor = slotColors['trim_main'] ?? '#ffffff';
  const roofColor = slotColors['roof_main'] ?? '#5a3b2c';

  return (
    <group position={[0, 0, 0]}>
      {/* Body */}
      <mesh position={[0, 1, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 2, 3]} />
        <meshStandardMaterial color={sidingColor} />
      </mesh>
      {/* Trim band */}
      <mesh position={[0, 2.05, 0]} castShadow>
        <boxGeometry args={[6.02, 0.1, 3.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      {/* Roof — a flattened pyramid */}
      <mesh position={[0, 2.7, 0]} castShadow rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.6, 1.2, 4]} />
        <meshStandardMaterial color={roofColor} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.7, 1.51]}>
        <boxGeometry args={[0.7, 1.4, 0.05]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#e8e2d5" />
      </mesh>
    </group>
  );
}

function GlbHome({ url, slotColors, manifest }: {
  url: string;
  slotColors: Record<string, string>;
  manifest: Record<string, string | string[]>;
}) {
  // Loads the asset via Three's GLTFLoader. Walks the scene graph and
  // overrides material color on meshes named in materialManifest when a
  // matching slot has a color overlay applied.
  const gltf = useLoader(GLTFLoader, url);

  // Memoize the modified scene per render of slotColors.
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj) => {
      const isMesh = (o: unknown): o is THREE.Mesh =>
        (o as THREE.Mesh).isMesh === true;
      if (!isMesh(obj)) return;
      // Find which slot this mesh belongs to.
      for (const [slot, meshNames] of Object.entries(manifest)) {
        const names = Array.isArray(meshNames) ? meshNames : [meshNames];
        if (!names.includes(obj.name)) continue;
        const color = slotColors[slot];
        if (!color) continue;
        // Clone material so we don't mutate shared instances.
        const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (m && 'color' in m) {
          const cloned = (m as THREE.MeshStandardMaterial).clone();
          cloned.color = new THREE.Color(color);
          obj.material = cloned;
        }
      }
    });
    return cloned;
  }, [gltf, slotColors, manifest]);

  return <primitive object={scene} />;
}

export function DesignStudio({
  homeId,
  homeName,
  baseListedPriceCents,
  pricesHidden,
  glbUrl,
  materialManifest,
  options,
}: Props) {
  // Initial selections: each option's default value (or the first value).
  const initialSelections: SelectionMap = useMemo(() => {
    const out: SelectionMap = {};
    for (const opt of options) {
      const def = opt.values.find((v) => v.is_default) ?? opt.values[0];
      if (def) out[opt.id] = def.id;
    }
    return out;
  }, [options]);
  const [selections, setSelections] = useState<SelectionMap>(initialSelections);

  // Slot → color overlay map for the renderer.
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

  // Real-time price recompute (mirrors the server-side trigger so the UI
  // doesn't lag the DB roundtrip).
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

  // Group options by category for the side panel.
  const byCategory = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const o of options) {
      const cat = o.category || 'misc';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(o);
    }
    return Array.from(map.entries());
  }, [options]);

  // Save flow.
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
      {/* Renderer */}
      <div className="design-canvas">
        <Canvas shadows camera={{ position: [8, 5, 8], fov: 38 }}>
          <Suspense fallback={
            <Html center>
              <div style={{ color: '#fff', fontSize: 13 }}>Loading scene…</div>
            </Html>
          }>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow />
            {glbUrl ? (
              <GlbHome url={glbUrl} slotColors={slotColors} manifest={materialManifest} />
            ) : (
              <PlaceholderHome slotColors={slotColors} />
            )}
            <Environment preset="sunset" />
            <OrbitControls makeDefault enableDamping target={[0, 1, 0]} maxPolarAngle={Math.PI / 2.2} />
          </Suspense>
        </Canvas>

        {!glbUrl && (
          <div className="design-placeholder-tag">
            Demo mode — no 3D asset uploaded for this model yet. Material swaps still work on the placeholder.
          </div>
        )}
      </div>

      {/* Sidebar */}
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
