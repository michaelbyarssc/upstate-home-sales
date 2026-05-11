'use client';

/**
 * PR 3.3 — image-based fallback for the 3D Design Studio.
 *
 * Renders the home's primary photo at full bleed with a row of "currently
 * picked" color chips overlaid. No WebGL, no GLTFLoader, no R3F bundle.
 *
 * Buyers on slow networks or low-end mobiles drop into this path
 * automatically (capability detection in the parent), and anyone can toggle
 * to it manually via the sidebar pill. The same swatch picker on the right
 * rail still drives the recompute path, so price + selection state stay in
 * sync between the two modes.
 */

import { type ModelOption, type ModelOptionValue, type OptionOverlay } from '@uhs/db';

type Props = {
  heroPhotoUrl: string | null;
  homeName: string;
  slotColors: Record<string, string>;
  options: Array<ModelOption & { values: ModelOptionValue[] }>;
  selections: Record<string, string>;
};

function colorForSelection(
  options: Props['options'],
  selections: Props['selections'],
  slot: string,
): string | null {
  const opt = options.find((o) => o.slot_name === slot);
  if (!opt) return null;
  const valId = selections[opt.id];
  if (!valId) return null;
  const val = opt.values.find((v) => v.id === valId);
  const ov = val?.overlay as OptionOverlay | undefined;
  return ov && ov.type === 'color' ? ov.color : null;
}

export function PhotoMode({ heroPhotoUrl, homeName, slotColors, options, selections }: Props) {
  // Pull the headline slots — these are the colors a passerby sees first.
  const heroSlots: Array<{ slot: string; label: string }> = [
    { slot: 'siding_main', label: 'Siding' },
    { slot: 'trim_main', label: 'Trim' },
    { slot: 'roof_main', label: 'Roof' },
  ];

  return (
    <div className="design-canvas design-canvas-photo">
      {heroPhotoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={heroPhotoUrl}
          alt={homeName}
          loading="eager"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: slotColors['siding_main'] ?? '#cbb89a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontFamily: 'var(--f-display)',
            fontSize: 24,
            letterSpacing: 0.5,
          }}
        >
          {homeName}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          padding: '12px 14px',
          background: 'rgba(20, 20, 20, 0.78)',
          color: '#fff',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          backdropFilter: 'blur(4px)',
        }}
      >
        <strong style={{ fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Your picks
        </strong>
        {heroSlots.map(({ slot, label }) => {
          const color =
            colorForSelection(options, selections, slot) ?? slotColors[slot] ?? null;
          if (!color) return null;
          return (
            <span key={slot} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: color,
                  border: '1px solid rgba(255,255,255,0.4)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.15) inset',
                }}
              />
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
