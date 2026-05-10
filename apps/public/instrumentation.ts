/**
 * Next.js instrumentation hook — loads Sentry server/edge configs based on runtime.
 * Required by @sentry/nextjs >= v8.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// onRequestError re-export added in @sentry/nextjs v9; we're on v8 so we
// rely on Next's default error reporting + Sentry's automatic instrumentation
// of route handlers. Upgrade to v9 to get RSC error context.
