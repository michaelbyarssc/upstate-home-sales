'use client';

import { useEffect } from 'react';

/** Adds `body.sign-mode` so the global site header/footer/compare-bar are hidden
 *  for the full-screen signing kiosk (mirrors the kiosk/portal pattern). */
export function SignBodyClass() {
  useEffect(() => {
    document.body.classList.add('sign-mode');
    return () => document.body.classList.remove('sign-mode');
  }, []);
  return null;
}
