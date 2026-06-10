'use client';

/**
 * The Design Studio visual. Replaces the former 3D canvas + photo fallback
 * with a single 2D approach that always reflects the buyer's picks:
 *
 *   - An illustrated house elevation (SVG) whose siding / trim / roof regions
 *     refill instantly from the selected option colors.
 *   - The home's actual photo as a small inset (real photos can't recolor).
 *   - A "Your picks" bar listing every option's selected value BY NAME, so a
 *     change is unmistakable even when two colors look similar.
 *
 * Recolorable slots follow the authoring convention: siding_main, trim_main,
 * roof_main (door_main also honored if a dealer adds one). Other slots still
 * show in the picks bar.
 */

import { type ModelOption, type ModelOptionValue, type OptionOverlay } from '@uhs/db';

type Props = {
  heroPhotoUrl: string | null;
  homeName: string;
  slotColors: Record<string, string>;
  options: Array<ModelOption & { values: ModelOptionValue[] }>;
  selections: Record<string, string>;
};

export function HousePreview({ heroPhotoUrl, homeName, slotColors, options, selections }: Props) {
  const siding = slotColors['siding_main'] ?? '#cbb89a';
  const trim = slotColors['trim_main'] ?? '#f4f1ea';
  const roof = slotColors['roof_main'] ?? '#6b6256';
  const door = slotColors['door_main'] ?? trim;

  // Selected value per option, in authoring order — drives the picks bar.
  const picks = options
    .map((opt) => {
      const val = opt.values.find((v) => v.id === selections[opt.id]);
      if (!val) return null;
      const ov = val.overlay as OptionOverlay;
      return {
        id: opt.id,
        optionLabel: opt.label,
        valueLabel: val.label,
        color: ov && ov.type === 'color' ? ov.color : null,
      };
    })
    .filter(Boolean) as Array<{ id: string; optionLabel: string; valueLabel: string; color: string | null }>;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px 96px',
      }}
    >
      <svg
        viewBox="0 0 760 440"
        role="img"
        aria-label={`Illustrated preview of ${homeName} in your selected colors`}
        style={{ width: 'min(88%, 720px)', height: 'auto', display: 'block' }}
      >
        {/* ground shadow */}
        <ellipse cx="380" cy="412" rx="305" ry="14" fill="rgba(0,0,0,0.28)" />

        {/* skirting */}
        <rect x="124" y="368" width="512" height="34" fill="#7a7468" />
        <rect x="124" y="368" width="512" height="34" fill="rgba(0,0,0,0.18)" />

        {/* siding body */}
        <rect x="110" y="180" width="540" height="190" fill={siding} />
        {/* lap-siding lines */}
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="110"
            x2="650"
            y1={196 + i * 15}
            y2={196 + i * 15}
            stroke="rgba(0,0,0,0.07)"
            strokeWidth="1.5"
          />
        ))}
        {/* right-side shading for depth */}
        <rect x="565" y="180" width="85" height="190" fill="rgba(0,0,0,0.06)" />

        {/* corner boards */}
        <rect x="110" y="180" width="10" height="190" fill={trim} />
        <rect x="640" y="180" width="10" height="190" fill={trim} />

        {/* roof + fascia */}
        <polygon points="88,182 380,106 672,182" fill={roof} />
        <polygon points="88,182 380,106 672,182" fill="rgba(0,0,0,0.05)" />
        <polygon points="120,174 380,112 640,174" fill="rgba(255,255,255,0.06)" />
        <rect x="96" y="172" width="568" height="12" fill={trim} />
        <rect x="96" y="181" width="568" height="3" fill="rgba(0,0,0,0.15)" />

        {/* windows — frame takes the trim color */}
        {[150, 245, 455, 550].map((x) => (
          <g key={x}>
            <rect x={x} y="226" width="70" height="62" rx="2" fill={trim} />
            <rect x={x + 6} y="232" width="58" height="50" fill="#b7cdd9" />
            <polygon
              points={`${x + 6},282 ${x + 30},232 ${x + 44},232 ${x + 6},268`}
              fill="rgba(255,255,255,0.35)"
            />
            <line x1={x + 35} x2={x + 35} y1="232" y2="282" stroke="rgba(0,0,0,0.18)" strokeWidth="2" />
            <line x1={x + 6} x2={x + 64} y1="257" y2="257" stroke="rgba(0,0,0,0.18)" strokeWidth="2" />
          </g>
        ))}

        {/* door */}
        <rect x="352" y="252" width="60" height="118" rx="2" fill={trim} />
        <rect x="358" y="258" width="48" height="112" fill={door} />
        <rect x="358" y="258" width="48" height="112" fill="rgba(0,0,0,0.10)" />
        <rect x="364" y="268" width="36" height="40" fill="rgba(255,255,255,0.12)" />
        <circle cx="398" cy="320" r="3" fill="rgba(0,0,0,0.45)" />

        {/* door steps */}
        <rect x="346" y="370" width="72" height="12" fill="#8d867a" />
        <rect x="354" y="382" width="56" height="12" fill="#7a7468" />
      </svg>

      <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
        Illustrative preview — your colors shown on a sample elevation
      </div>

      {/* actual photo inset (real photos can't recolor) */}
      {heroPhotoUrl && (
        <figure className="design-photo-inset">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroPhotoUrl} alt={`${homeName} — actual photo`} loading="eager" />
          <figcaption>Actual home</figcaption>
        </figure>
      )}

      {/* picks readout — value names make every change unmistakable */}
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
          gap: 16,
          flexWrap: 'wrap',
          backdropFilter: 'blur(4px)',
        }}
      >
        <strong style={{ fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Your picks
        </strong>
        {picks.map((p) => (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: p.color ?? 'rgba(255,255,255,0.25)',
                border: '1px solid rgba(255,255,255,0.4)',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.15) inset',
              }}
            />
            <span style={{ color: 'rgba(255,255,255,0.65)' }}>{p.optionLabel}:</span>
            <strong>{p.valueLabel}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
