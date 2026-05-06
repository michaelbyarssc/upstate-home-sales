// Token values mirrored in TypeScript so app code (e.g. Tailwind theme,
// inline style props for charts) can reference them without parsing CSS.
// Keep in lockstep with tokens.css.

export const color = {
  navy: '#1a2a3a',
  navyDeep: '#0f1c29',
  navySoft: '#2a3e54',
  cream: '#f6efe6',
  creamDeep: '#ece2d2',
  paper: '#fbfbf9',
  brick: '#b9532a',
  brickDeep: '#9a4220',
  brickSoft: '#f6e9e1',
  pluff: '#3a4248',
  pluffSoft: '#6a727a',
  marsh: '#7a8a5b',
  line: '#e0d9cc',
  lineSoft: '#efe9dd',
  error: '#b3261e',
  warn: '#b07b00',
} as const;

export const font = {
  display: "'Cormorant Garamond', 'EB Garamond', Georgia, serif",
  body: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
} as const;

export const radius = {
  r1: '2px',
  r2: '4px',
  r3: '8px',
  pill: '999px',
} as const;

export const ease = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

export type ColorToken = keyof typeof color;
