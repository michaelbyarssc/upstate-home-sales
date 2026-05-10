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

const sentryBuildOptions = {
  silent: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
