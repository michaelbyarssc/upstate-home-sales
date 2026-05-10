'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { VisitorEventKind } from '@uhs/db';

/**
 * Phase G — client-side beacon for /api/track.
 *
 * Fires a single `page_view` (or specialized event when `eventType` prop is
 * passed) per route. Uses a per-tab session id stored in sessionStorage so
 * the dealer can dedupe visits in the funnel report.
 *
 * Mounted once in the root layout for `page_view`. Other components mount
 * their own instance with `eventType` + `homeId` for finer-grained events
 * (e.g., on the home detail page).
 */

const SESSION_KEY = 'uhs_visitor_session';

function getOrCreateSession(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

type Props = {
  eventType?: VisitorEventKind;
  homeId?: string | null;
  leadId?: string | null;
};

export function VisitorTracker({ eventType = 'page_view', homeId = null, leadId = null }: Props) {
  const pathname = usePathname();

  useEffect(() => {
    const session = getOrCreateSession();
    if (!session) return;

    // Capture UTM + referrer once per page load.
    const url = new URL(window.location.href);
    const payload = {
      session_id: session,
      event_type: eventType,
      home_id: homeId,
      lead_id: leadId,
      path: pathname,
      referrer_url: typeof document !== 'undefined' ? document.referrer || null : null,
      utm_source: url.searchParams.get('utm_source'),
      utm_medium: url.searchParams.get('utm_medium'),
      utm_campaign: url.searchParams.get('utm_campaign'),
    };

    // Use sendBeacon when available (fires on page unload too); fall back
    // to fetch with keepalive otherwise.
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
        return;
      } catch {
        // fall through to fetch
      }
    }
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Tracking is best-effort; never surface to the user.
    });
  }, [pathname, eventType, homeId, leadId]);

  return null;
}
