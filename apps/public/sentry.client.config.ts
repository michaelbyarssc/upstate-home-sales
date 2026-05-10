/**
 * Sentry — public app, browser side.
 *
 * No-op when SENTRY_DSN isn't set, so local dev + preview deploys without
 * the env var don't try to ship events.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    ignoreErrors: [
      // Chrome extensions and benign noise.
      /A listener indicated an asynchronous response/,
      /ResizeObserver loop limit exceeded/,
    ],
  });
}
