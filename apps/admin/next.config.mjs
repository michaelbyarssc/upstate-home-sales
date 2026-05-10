import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@uhs/db', '@uhs/design-tokens'],
};

const sentryBuildOptions = {
  silent: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
};

export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
