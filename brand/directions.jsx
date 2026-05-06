// Brand direction artboards — each direction is a single column showing
// wordmark, monogram, palette, type pairing, sample header, body voice,
// and a sample CTA so the system can be evaluated as a whole.

const Swatch = ({ name, hex, on = '#fff', label }) => (
  <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}>
    <div style={{ width: 64, background: hex }}></div>
    <div style={{ flex: 1, padding: '10px 12px', background: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#11181c', letterSpacing: '0.02em' }}>{name}</div>
      <div style={{ fontSize: 11, color: '#6a727a', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{hex}</div>
      {label && <div style={{ fontSize: 10, color: '#6a727a', marginTop: 2 }}>{label}</div>}
    </div>
  </div>
);

const Block = ({ title, children, dense }) => (
  <section style={{ marginTop: dense ? 16 : 28 }}>
    <h3 style={{
      font: '600 11px/1 Inter, system-ui, sans-serif',
      letterSpacing: '0.16em', textTransform: 'uppercase',
      color: '#6a727a', margin: '0 0 12px',
    }}>{title}</h3>
    {children}
  </section>
);

// ─── D1 — EDITORIAL SERIF ──────────────────────────────────────
const D1Editorial = () => (
  <div style={{ background: '#fbfbf9', padding: 48, fontFamily: 'Inter, system-ui, sans-serif', height: '100%', overflow: 'hidden' }}>
    <div style={{ font: '500 10px/1 Inter', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6a727a' }}>
      Direction 01
    </div>
    <h1 style={{ font: 'italic 500 44px/1 "Cormorant Garamond", "EB Garamond", Georgia, serif', letterSpacing: '-0.01em', color: '#1a2a3a', margin: '8px 0 4px' }}>
      Editorial
    </h1>
    <p style={{ fontSize: 14, color: '#3a4248', margin: '0 0 32px', maxWidth: 460 }}>
      A grown-up dealer. Carolina-rooted, magazine-quality. Confident enough to use a serif in a category that defaults to bold blue sans.
    </p>

    <Block title="Wordmark">
      <div style={{ padding: '20px 0' }}>
        <Wordmark direction="editorial" />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e6e8eb' }}>
        <Monogram direction="editorial" size={56} />
        <div style={{ font: '400 12px/1.4 Inter', color: '#6a727a' }}>
          Avatar / favicon mark<br />
          <span style={{ color: '#11181c', fontWeight: 500 }}>U + HOMES stack</span>
        </div>
      </div>
    </Block>

    <Block title="Palette">
      <div style={{ display: 'grid', gap: 6 }}>
        <Swatch name="Charleston Navy" hex="#1a2a3a" label="primary · ink" />
        <Swatch name="Lowcountry Cream" hex="#f6efe6" label="paper" />
        <Swatch name="Brick" hex="#b9532a" label="accent · CTAs" />
        <Swatch name="Pluff Mud" hex="#3a4248" label="body text" />
        <Swatch name="Marsh Grass" hex="#8a9a6b" label="utility · success" />
      </div>
    </Block>

    <Block title="Type pairing">
      <div style={{ borderLeft: '3px solid #b9532a', paddingLeft: 16 }}>
        <div style={{ font: '500 36px/1.05 "Cormorant Garamond", "EB Garamond", Georgia, serif', color: '#1a2a3a', letterSpacing: '-0.01em' }}>
          The home you've been
          <br /><em style={{ fontWeight: 400 }}>quietly imagining.</em>
        </div>
        <p style={{ font: '400 14px/1.55 Inter, system-ui, sans-serif', color: '#3a4248', maxWidth: 380, margin: '14px 0 0' }}>
          242 manufactured and modular homes ready for delivery across South Carolina and North Carolina. Real prices. Real photos. No call-for-quote runaround.
        </p>
      </div>
      <div style={{ marginTop: 18, fontSize: 11, color: '#6a727a' }}>
        Display: <strong style={{ color: '#11181c' }}>Cormorant Garamond</strong> &nbsp;·&nbsp;
        Body: <strong style={{ color: '#11181c' }}>Inter</strong>
      </div>
    </Block>

    <Block title="Voice (sample)">
      <div style={{ background: '#fff', padding: 20, border: '1px solid #e6e8eb', borderRadius: 4 }}>
        <div style={{ font: '500 13px/1.5 Inter', color: '#11181c', marginBottom: 4 }}>Hero</div>
        <p style={{ margin: 0, font: '400 14px/1.55 Inter', color: '#3a4248' }}>
          "Built well. Priced honestly. Delivered to your land." — long, quiet, confident. Pairs with a wide landscape photo of a delivered home.
        </p>
      </div>
    </Block>

    <Block title="Primary button">
      <button style={{
        font: '500 14px/1 Inter', padding: '14px 24px', border: 'none',
        background: '#b9532a', color: '#fff', borderRadius: 2, cursor: 'pointer',
        letterSpacing: '0.02em',
      }}>
        Browse 242 homes →
      </button>
    </Block>
  </div>
);

// ─── D2 — PRAGMATIC MODERN ──────────────────────────────────────
const D2Pragmatic = () => (
  <div style={{ background: '#fff', padding: 48, fontFamily: 'Inter, system-ui, sans-serif', height: '100%', overflow: 'hidden' }}>
    <div style={{ font: '500 10px/1 Inter', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6a727a' }}>
      Direction 02
    </div>
    <h1 style={{ font: '700 40px/1 Inter, system-ui, sans-serif', letterSpacing: '-0.03em', color: '#0e0e0e', margin: '8px 0 4px' }}>
      Pragmatic
    </h1>
    <p style={{ fontSize: 14, color: '#3a4248', margin: '0 0 32px', maxWidth: 460 }}>
      Hi-tech retailer aesthetic. Looks like Apple shopping for housing. Maximum trust through restraint — black, white, one accent, sharp grid, big photography.
    </p>

    <Block title="Wordmark">
      <div style={{ padding: '20px 0' }}>
        <Wordmark direction="pragmatic" />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e6e8eb' }}>
        <Monogram direction="pragmatic" size={56} />
        <div style={{ font: '400 12px/1.4 Inter', color: '#6a727a' }}>
          Avatar / favicon mark<br />
          <span style={{ color: '#11181c', fontWeight: 500 }}>UH lockup</span>
        </div>
      </div>
    </Block>

    <Block title="Palette">
      <div style={{ display: 'grid', gap: 6 }}>
        <Swatch name="Ink" hex="#0e0e0e" label="primary" />
        <Swatch name="Paper" hex="#ffffff" label="background" />
        <Swatch name="Concrete" hex="#f4f4f2" label="panel" />
        <Swatch name="Signal" hex="#d34f1c" label="accent · single use" />
        <Swatch name="Graphite" hex="#5a5e64" label="body text" />
      </div>
    </Block>

    <Block title="Type pairing">
      <div>
        <div style={{ font: '700 44px/1 Inter, system-ui, sans-serif', color: '#0e0e0e', letterSpacing: '-0.035em' }}>
          242 homes.<br />Ready now.
        </div>
        <p style={{ font: '400 14px/1.55 Inter', color: '#5a5e64', maxWidth: 380, margin: '14px 0 0' }}>
          Filter by beds, baths, square footage, manufacturer. Every home shows a real starting price. Free delivery quote in 24 hours.
        </p>
      </div>
      <div style={{ marginTop: 18, fontSize: 11, color: '#6a727a' }}>
        Display + Body: <strong style={{ color: '#11181c' }}>Inter</strong> (single family, full weight range)
      </div>
    </Block>

    <Block title="Voice (sample)">
      <div style={{ background: '#f4f4f2', padding: 20, borderRadius: 0 }}>
        <div style={{ font: '600 13px/1.5 Inter', color: '#0e0e0e', marginBottom: 4 }}>Hero</div>
        <p style={{ margin: 0, font: '400 14px/1.55 Inter', color: '#3a4248' }}>
          "242 homes. Ready now." — short, declarative, numeric. Pairs with a giant single hero photo and a single primary CTA.
        </p>
      </div>
    </Block>

    <Block title="Primary button">
      <button style={{
        font: '600 14px/1 Inter', padding: '14px 22px', border: 'none',
        background: '#0e0e0e', color: '#fff', borderRadius: 4, cursor: 'pointer',
        letterSpacing: '-0.005em',
      }}>
        Browse all homes
      </button>
    </Block>
  </div>
);

// ─── D3 — CAROLINA WARMTH ──────────────────────────────────────
const D3Carolina = () => (
  <div style={{ background: '#f6efe6', padding: 48, fontFamily: 'Inter, system-ui, sans-serif', height: '100%', overflow: 'hidden' }}>
    <div style={{ font: '500 10px/1 Inter', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7a6b5a' }}>
      Direction 03
    </div>
    <h1 style={{ font: '600 42px/1 "Source Serif Pro", "Iowan Old Style", Georgia, serif', letterSpacing: '-0.015em', color: '#3a2a1a', margin: '8px 0 4px' }}>
      Carolina Warmth
    </h1>
    <p style={{ fontSize: 14, color: '#5a4a38', margin: '0 0 32px', maxWidth: 460 }}>
      Neighborly and rooted. Pitched-roof house mark, warm sand background, a little brick. The local-family-business reading without the dated executions.
    </p>

    <Block title="Wordmark">
      <div style={{ padding: '20px 0' }}>
        <Wordmark direction="carolina" />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(58,42,26,0.12)' }}>
        <Monogram direction="carolina" size={56} />
        <div style={{ font: '400 12px/1.4 Inter', color: '#7a6b5a' }}>
          Avatar / favicon mark<br />
          <span style={{ color: '#3a2a1a', fontWeight: 500 }}>House silhouette + brick door</span>
        </div>
      </div>
    </Block>

    <Block title="Palette">
      <div style={{ display: 'grid', gap: 6 }}>
        <Swatch name="Walnut" hex="#3a2a1a" label="primary · ink" />
        <Swatch name="Sand" hex="#f6efe6" label="paper" />
        <Swatch name="Brick" hex="#b9532a" label="accent · CTAs" />
        <Swatch name="Pine" hex="#2f4a3a" label="secondary accent" />
        <Swatch name="Linen" hex="#e8dfd1" label="panel · cards" />
      </div>
    </Block>

    <Block title="Type pairing">
      <div>
        <div style={{ font: '600 38px/1.1 "Source Serif Pro", "Iowan Old Style", Georgia, serif', color: '#3a2a1a', letterSpacing: '-0.01em' }}>
          Homes for real Carolina families.
        </div>
        <p style={{ font: '400 14px/1.55 Inter', color: '#5a4a38', maxWidth: 380, margin: '14px 0 0' }}>
          Family-owned in [town], SC. We deliver across South Carolina and North Carolina, and we'll help you figure out the land, the financing, and the foundation — not just the floor plan.
        </p>
      </div>
      <div style={{ marginTop: 18, fontSize: 11, color: '#7a6b5a' }}>
        Display: <strong style={{ color: '#3a2a1a' }}>Source Serif Pro</strong> &nbsp;·&nbsp;
        Body: <strong style={{ color: '#3a2a1a' }}>Inter</strong>
      </div>
    </Block>

    <Block title="Voice (sample)">
      <div style={{ background: '#e8dfd1', padding: 20, borderRadius: 6 }}>
        <div style={{ font: '600 13px/1.5 Inter', color: '#3a2a1a', marginBottom: 4 }}>Hero</div>
        <p style={{ margin: 0, font: '400 14px/1.55 Inter', color: '#5a4a38' }}>
          "Homes for real Carolina families." — warm, plain-spoken, slightly literary. Pairs with porch / lifestyle photography.
        </p>
      </div>
    </Block>

    <Block title="Primary button">
      <button style={{
        font: '500 14px/1 Inter', padding: '14px 24px', border: 'none',
        background: '#b9532a', color: '#fff', borderRadius: 6, cursor: 'pointer',
      }}>
        See homes near you
      </button>
    </Block>
  </div>
);

// ─── D4 — BOLD CONTEMPORARY ──────────────────────────────────────
const D4Bold = () => (
  <div style={{ background: '#0a0a0a', padding: 48, fontFamily: 'Inter, system-ui, sans-serif', height: '100%', overflow: 'hidden', color: '#f5f5f3' }}>
    <div style={{ font: '500 10px/1 Inter', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a8a8a3' }}>
      Direction 04
    </div>
    <h1 style={{ font: '900 44px/1 "Archivo", Inter, sans-serif', letterSpacing: '-0.04em', color: '#fff', margin: '8px 0 4px' }}>
      BOLD / CONTEMPORARY
    </h1>
    <p style={{ fontSize: 14, color: '#a8a8a3', margin: '0 0 32px', maxWidth: 460 }}>
      Disrupts the category visually. Reads more like a furniture brand or a modernist studio than a manufactured-home dealer. Highest risk, highest reward.
    </p>

    <Block title="Wordmark">
      <div style={{ padding: '20px 0' }}>
        <Wordmark direction="bold" />
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #2a2a28' }}>
        <Monogram direction="bold" size={56} />
        <div style={{ font: '400 12px/1.4 Inter', color: '#a8a8a3' }}>
          Avatar / favicon mark<br />
          <span style={{ color: '#fff', fontWeight: 500 }}>UP / HM stacked</span>
        </div>
      </div>
    </Block>

    <Block title="Palette">
      <div style={{ display: 'grid', gap: 6 }}>
        <Swatch name="Carbon" hex="#0a0a0a" label="primary" />
        <Swatch name="Bone" hex="#f5f5f3" label="paper" />
        <Swatch name="Persimmon" hex="#c8553d" label="accent · CTAs" />
        <Swatch name="Steel" hex="#3c4248" label="utility" />
        <Swatch name="Lime" hex="#c8e25a" label="rare highlight" />
      </div>
    </Block>

    <Block title="Type pairing">
      <div>
        <div style={{ font: '900 48px/0.95 "Archivo", Inter, sans-serif', color: '#fff', letterSpacing: '-0.04em', textTransform: 'uppercase' }}>
          Houses<br />
          <span style={{ color: '#c8553d' }}>without the</span><br />
          BS.
        </div>
        <p style={{ font: '400 14px/1.55 Inter', color: '#a8a8a3', maxWidth: 380, margin: '14px 0 0' }}>
          242 homes in stock across the Carolinas. Real photos. Real prices. Delivered straight to your land — or ours, if you don't have one yet.
        </p>
      </div>
      <div style={{ marginTop: 18, fontSize: 11, color: '#a8a8a3' }}>
        Display: <strong style={{ color: '#fff' }}>Archivo Black</strong> &nbsp;·&nbsp;
        Body: <strong style={{ color: '#fff' }}>Inter</strong>
      </div>
    </Block>

    <Block title="Voice (sample)">
      <div style={{ background: '#1a1a18', padding: 20, borderRadius: 0, borderLeft: '4px solid #c8553d' }}>
        <div style={{ font: '600 13px/1.5 Inter', color: '#fff', marginBottom: 4 }}>Hero</div>
        <p style={{ margin: 0, font: '400 14px/1.55 Inter', color: '#a8a8a3' }}>
          "Houses without the BS." — high-confidence, irreverent, slightly punk. Risks alienating older buyers; wins with younger / first-time buyers.
        </p>
      </div>
    </Block>

    <Block title="Primary button">
      <button style={{
        font: '700 14px/1 Inter', padding: '16px 28px', border: 'none',
        background: '#c8553d', color: '#fff', borderRadius: 0, cursor: 'pointer',
        letterSpacing: '0.02em', textTransform: 'uppercase',
      }}>
        Shop the inventory
      </button>
    </Block>
  </div>
);

window.D1Editorial = D1Editorial;
window.D2Pragmatic = D2Pragmatic;
window.D3Carolina = D3Carolina;
window.D4Bold = D4Bold;
