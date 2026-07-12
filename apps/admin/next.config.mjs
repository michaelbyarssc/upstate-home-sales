import { withSentryConfig } from '@sentry/nextjs';

// Supabase origin appears in several CSP directives (API, storage images,
// realtime). Derive it from the build-time env so the policy can't drift
// from the real project; fall back to prod if unset.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return 'https://ojtudvezjvrcdqgbrnyc.supabase.co';
  }
})();
const SUPABASE_WSS = SUPABASE_ORIGIN.replace('https://', 'wss://');

// Report-only until one authenticated dealer session (leads inbox +
// kanban realtime, placement editor, PDF generation) shows a console clean
// of CSP violations — then flip to false to enforce. The public app already
// enforces; this is the admin-only soak. Report-only logs violations to the
// browser console but blocks nothing.
const CSP_REPORT_ONLY = true;

// next dev needs eval (React Refresh) and websockets (HMR); production
// builds never include these.
const isDev = process.env.NODE_ENV === 'development';

// Full origin inventory + rationale: docs/security-headers.md.
// Adding a third-party script or embed requires updating this list.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://maps.googleapis.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN} https://frontend-jypnlxgeua-uc.a.run.app https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com https://streetviewpixels-pa.googleapis.com`,
  // blob: covers pdfjs fetching client-generated PDF blobs. wss: Supabase
  // Realtime (toasts, leads inbox, kanban) — breaks silently if missing.
  `connect-src 'self'${isDev ? ' ws:' : ''} blob: ${SUPABASE_ORIGIN} ${SUPABASE_WSS} https://maps.googleapis.com https://*.googleapis.com`,
  "frame-src 'none'",
  // pdfjs worker (/pdf.worker.min.mjs) + Sentry Replay worker.
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  {
    key: CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    value: csp,
  },
  // Admin renders no iframes and must never be framed.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Overrides Vercel's platform default (same max-age, adds includeSubDomains).
  // Deliberately no `preload` — that's a one-way door with no benefit here.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@uhs/db', '@uhs/design-tokens'],
  experimental: {
    // Required on Next 14 so instrumentation.ts is loaded at boot
    // (default-on in Next 15). Sentry needs this to initialize the SDK.
    instrumentationHook: true,
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

const sentryBuildOptions = {
  silent: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
