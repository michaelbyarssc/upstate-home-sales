import { withSentryConfig } from '@sentry/nextjs';

// Supabase origin appears in several CSP directives (API, storage images,
// signed-PDF iframes, realtime). Derive it from the build-time env so the
// policy can't drift from the real project; fall back to prod if unset.
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return 'https://ojtudvezjvrcdqgbrnyc.supabase.co';
  }
})();
const SUPABASE_WSS = SUPABASE_ORIGIN.replace('https://', 'wss://');

// Escape hatch: set to true to switch the CSP header to
// Content-Security-Policy-Report-Only (violations log to the console but
// nothing is blocked) while keeping every other header enforced.
const CSP_REPORT_ONLY = false;

// next dev needs eval (React Refresh) and websockets (HMR); production
// builds never include these.
const isDev = process.env.NODE_ENV === 'development';

// Full origin inventory + rationale: docs/security-headers.md.
// Adding a marketing tag or third-party embed requires updating this list.
const csp = [
  "default-src 'self'",
  // 'unsafe-inline': Next.js bootstrap + JSON-LD dangerouslySetInnerHTML +
  // next/script pixel-init blocks. GA4/GTM/Meta stay allowlisted even when
  // the dealer hasn't enabled them (toggled from admin at runtime).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://static.signwell.com https://maps.googleapis.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN} https://frontend-jypnlxgeua-uc.a.run.app https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com https://streetviewpixels-pa.googleapis.com https://www.facebook.com https://www.google-analytics.com https://www.googletagmanager.com`,
  `connect-src 'self'${isDev ? ' ws:' : ''} ${SUPABASE_ORIGIN} ${SUPABASE_WSS} https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://maps.googleapis.com https://*.googleapis.com https://frontend-jypnlxgeua-uc.a.run.app`,
  // 'self': the SignWell kiosk iframe navigates to OUR /sign/return on
  // completion, and child-frame navigation is checked against frame-src.
  // Wildcards don't match apexes, so apex + wildcard are both listed.
  `frame-src 'self' ${SUPABASE_ORIGIN} https://signwell.com https://*.signwell.com https://matterport.com https://*.matterport.com https://www.google.com https://www.googletagmanager.com https://www.facebook.com`,
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  {
    key: CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    value: csp,
  },
  // SAMEORIGIN, not DENY: the SignWell completion redirect renders our own
  // page inside an iframe whose parent is our origin.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
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

// Sentry build-time config. Wrapping is safe even without a DSN at build
// time; runtime instrumentation also no-ops when SENTRY_DSN is missing.
const sentryBuildOptions = {
  silent: true,
  disableLogger: true,
  // Tunnel through /monitoring to bypass ad-blockers when DSN is set.
  tunnelRoute: '/monitoring',
};

// Only wrap when SENTRY_AUTH_TOKEN is set so local + preview builds without
// it stay fast and don't try to upload source maps.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
