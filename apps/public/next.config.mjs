import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@uhs/db', '@uhs/design-tokens'],
  experimental: {
    // Required on Next 14 so instrumentation.ts is loaded at boot
    // (default-on in Next 15). Sentry needs this to initialize the SDK.
    instrumentationHook: true,
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
