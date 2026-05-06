// Wordmark + logomark explorations for UHS.
// Four directions, each rendered as inline SVG so we can iterate quickly.

const Wordmark = ({ direction, mono, size = 1 }) => {
  const ink = mono ? '#11181c' : null;

  if (direction === 'editorial') {
    // D1 — Editorial Serif: Carolina-rooted, confident, "we're the grown-up dealer"
    const c = ink || '#1a2a3a';
    return (
      <svg viewBox="0 0 440 80" width={340 * size} style={{ display: 'block' }}>
        <text x="0" y="56" fill={c}
          style={{ font: '600 56px/1 "Cormorant Garamond", "EB Garamond", Georgia, serif', letterSpacing: '-0.02em' }}>
          Upstate
        </text>
        <text x="248" y="56" fill={c}
          style={{ font: 'italic 300 56px/1 "Cormorant Garamond", "EB Garamond", Georgia, serif', letterSpacing: '-0.01em' }}>
          Homes
        </text>
        <line x1="0" y1="68" x2="400" y2="68" stroke={c} strokeWidth="1" opacity="0.5" />
        <text x="0" y="78" fill={c} opacity="0.7"
          style={{ font: '500 9px/1 "Inter", system-ui, sans-serif', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          South Carolina · Est. 2024
        </text>
      </svg>
    );
  }

  if (direction === 'pragmatic') {
    // D2 — Pragmatic Modern: clean grotesque, all caps, all-business
    const c = ink || '#0e0e0e';
    return (
      <svg viewBox="0 0 360 80" width={300 * size} style={{ display: 'block' }}>
        <text x="0" y="44" fill={c}
          style={{ font: '700 36px/1 "Inter", "Helvetica Neue", sans-serif', letterSpacing: '-0.02em' }}>
          UPSTATE HOMES
        </text>
        <line x1="0" y1="54" x2="36" y2="54" stroke={c} strokeWidth="3" />
        <text x="44" y="60" fill={c} opacity="0.65"
          style={{ font: '500 11px/1 "Inter", system-ui, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Manufactured · Modular · Mobile
        </text>
      </svg>
    );
  }

  if (direction === 'carolina') {
    // D3 — Carolina Warmth: rounded humanist sans + house mark, neighborly
    const c = ink || '#3a2a1a';
    const accent = mono ? c : '#b9532a';
    return (
      <svg viewBox="0 0 380 80" width={310 * size} style={{ display: 'block' }}>
        {/* House mark — simple geometric pitched roof */}
        <g transform="translate(2, 12)">
          <path d="M28 4 L52 28 L52 56 L4 56 L4 28 Z" fill="none" stroke={c} strokeWidth="3" strokeLinejoin="round" />
          <rect x="22" y="38" width="12" height="18" fill={accent} />
          <rect x="10" y="32" width="8" height="8" fill="none" stroke={c} strokeWidth="2" />
          <rect x="38" y="32" width="8" height="8" fill="none" stroke={c} strokeWidth="2" />
        </g>
        <text x="68" y="44" fill={c}
          style={{ font: '600 32px/1 "Source Serif Pro", "Iowan Old Style", Georgia, serif', letterSpacing: '-0.01em' }}>
          Upstate Homes
        </text>
        <text x="68" y="62" fill={c} opacity="0.7"
          style={{ font: '400 12px/1 "Inter", system-ui, sans-serif', letterSpacing: '0.04em' }}>
          A South Carolina home dealer
        </text>
      </svg>
    );
  }

  if (direction === 'bold') {
    // D4 — Bold Contemporary: heavy display, modernist, surprising for the category
    const c = ink || '#0a0a0a';
    const accent = mono ? c : '#c8553d';
    return (
      <svg viewBox="0 0 420 100" width={320 * size} style={{ display: 'block' }}>
        <text x="0" y="48" fill={c}
          style={{ font: '900 52px/0.9 "Archivo", "Inter", sans-serif', letterSpacing: '-0.04em' }}>
          UPSTATE
        </text>
        <text x="0" y="92" fill={accent}
          style={{ font: '900 52px/0.9 "Archivo", "Inter", sans-serif', letterSpacing: '-0.04em' }}>
          HOMES
        </text>
        <text x="282" y="60" fill={c} opacity="0.45"
          style={{ font: '500 10px/1.4 "Inter", system-ui, sans-serif', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          <tspan x="282" dy="0">Manufactured</tspan>
          <tspan x="282" dy="14">homes for the</tspan>
          <tspan x="282" dy="14">Carolinas</tspan>
        </text>
      </svg>
    );
  }

  return null;
};

// Compact monogram / favicon mark per direction
const Monogram = ({ direction, size = 64 }) => {
  if (direction === 'editorial') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <rect width="64" height="64" rx="6" fill="#1a2a3a" />
        <text x="32" y="44" textAnchor="middle" fill="#f6e9e1"
          style={{ font: 'italic 600 38px/1 "Cormorant Garamond", Georgia, serif' }}>U</text>
        <text x="32" y="56" textAnchor="middle" fill="#f6e9e1" opacity="0.7"
          style={{ font: '500 7px/1 "Inter", sans-serif', letterSpacing: '0.2em' }}>HOMES</text>
      </svg>
    );
  }
  if (direction === 'pragmatic') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <rect width="64" height="64" fill="#0e0e0e" />
        <text x="32" y="42" textAnchor="middle" fill="#fff"
          style={{ font: '900 32px/1 "Inter", sans-serif', letterSpacing: '-0.05em' }}>UH</text>
      </svg>
    );
  }
  if (direction === 'carolina') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <rect width="64" height="64" rx="32" fill="#f6efe6" />
        <path d="M32 14 L50 32 L50 50 L14 50 L14 32 Z" fill="none" stroke="#3a2a1a" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="28" y="38" width="8" height="12" fill="#b9532a" />
      </svg>
    );
  }
  if (direction === 'bold') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <rect width="64" height="64" fill="#0a0a0a" />
        <text x="32" y="38" textAnchor="middle" fill="#fff"
          style={{ font: '900 26px/1 "Archivo", sans-serif', letterSpacing: '-0.04em' }}>UP</text>
        <text x="32" y="58" textAnchor="middle" fill="#c8553d"
          style={{ font: '900 26px/1 "Archivo", sans-serif', letterSpacing: '-0.04em' }}>HM</text>
      </svg>
    );
  }
  return null;
};

window.Wordmark = Wordmark;
window.Monogram = Monogram;
