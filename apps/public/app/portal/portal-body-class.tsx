'use client';

import { useEffect } from 'react';

/**
 * Adds `body.portal-mode` so the global header/footer/compare-bar
 * are hidden on every /portal route. Cleans up on unmount.
 */
export function PortalBodyClass() {
  useEffect(() => {
    document.body.classList.add('portal-mode');
    return () => document.body.classList.remove('portal-mode');
  }, []);
  return null;
}
