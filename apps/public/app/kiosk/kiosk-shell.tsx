'use client';

import { useEffect, useRef } from 'react';

const IDLE_RESET_MS = 5 * 60 * 1000; // 5 minutes
const HOME_PATH = '/kiosk';

/**
 * Wraps every page under /kiosk. Two responsibilities:
 *   1. Hides the global site chrome (top bar, nav, footer, compare bar) by
 *      injecting a body class — keeps the existing layout components untouched.
 *   2. Resets to /kiosk after IDLE_RESET_MS of no user input. Keeps the tablet
 *      ready for the next walk-up customer.
 */
export function KioskShell({ children }: { children: React.ReactNode }) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.add('kiosk-mode');

    function reset() {
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (window.location.pathname !== HOME_PATH) {
          window.location.href = HOME_PATH;
        } else {
          // Already on the landing — just scroll to top so the next visitor
          // sees a clean state.
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, IDLE_RESET_MS);
    }

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      document.body.classList.remove('kiosk-mode');
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  return <div className="kiosk-root">{children}</div>;
}
