'use client';

import { useEffect } from 'react';
import { captureAttributionFromUrl } from '../lib/attribution';

/**
 * Mounted in the public site root layout. Records UTM/referrer/landing once
 * per page load (or whenever a new utm_* / gclid / fbclid arrives in the URL).
 * Renders nothing.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttributionFromUrl();
  }, []);
  return null;
}
