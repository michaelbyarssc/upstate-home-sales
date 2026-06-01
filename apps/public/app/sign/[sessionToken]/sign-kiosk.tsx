'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { advanceSigner } from './actions';

type SignWellEmbedInstance = { open: () => void; close?: () => void };
type SignWellEmbedOptions = {
  url: string;
  containerId?: string;
  allowDownload?: boolean;
  events?: {
    completed?: (e: unknown) => void;
    declined?: (e: unknown) => void;
    closed?: (e: unknown) => void;
  };
};
type SignWellEmbedCtor = new (opts: SignWellEmbedOptions) => SignWellEmbedInstance;

declare global {
  interface Window {
    SignWellEmbed?: SignWellEmbedCtor;
  }
}

const SCRIPT_SRC = 'https://static.signwell.com/assets/embedded.js';

function loadSignWell(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (window.SignWellEmbed) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('SignWell script failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('SignWell script failed'));
    document.head.appendChild(s);
  });
}

export function SignKiosk({
  sessionToken,
  embeddedUrl,
  currentRoleLabel,
  stepNumber,
  totalSteps,
  orgName,
  brandColor,
  docTitle,
}: {
  sessionToken: string;
  embeddedUrl: string;
  currentRoleLabel: string;
  stepNumber: number;
  totalSteps: number;
  orgName: string;
  brandColor: string | null;
  docTitle: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const embedRef = useRef<SignWellEmbedInstance | null>(null);

  function advance() {
    startTransition(async () => {
      await advanceSigner({ sessionToken });
      // Hard reload (not router.refresh): SignWell's embedded.js doesn't re-mount
      // cleanly into a soft-refreshed page — the next signer's iframe loads but
      // isn't interactive. A full reload gives each signer a clean, clickable embed.
      window.location.reload();
    });
  }

  // Mount the SignWell embedded signing experience into the container.
  useEffect(() => {
    let cancelled = false;
    loadSignWell()
      .then(() => {
        if (cancelled || !window.SignWellEmbed) return;
        const embed = new window.SignWellEmbed({
          url: embeddedUrl,
          containerId: 'signwell-embed',
          allowDownload: true,
          events: {
            completed: () => advance(),
            declined: () => router.refresh(),
          },
        });
        embedRef.current = embed;
        embed.open();
      })
      .catch(() => {
        /* the fallback "Done" button still lets the dealer advance */
      });
    return () => {
      cancelled = true;
      try {
        embedRef.current?.close?.();
      } catch {
        /* ignore */
      }
      embedRef.current = null;
    };
    // Re-mount whenever the signer (and thus the URL) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedUrl]);

  const last = stepNumber >= totalSteps;

  return (
    <div className="kiosk">
      <header className="kiosk-head" style={brandColor ? { borderBottomColor: brandColor } : undefined}>
        <div>
          <div className="kiosk-org">{orgName}</div>
          <div className="kiosk-doc">{docTitle}</div>
        </div>
        <div className="kiosk-step">
          Signer {stepNumber} of {totalSteps}: <strong>{currentRoleLabel}</strong>
        </div>
      </header>

      <div className="kiosk-frame">
        <div id="signwell-embed" className="kiosk-embed" />
      </div>

      <footer className="kiosk-foot">
        <p>
          {currentRoleLabel}, sign above. When you’re done it advances automatically — or tap to
          continue.
        </p>
        <button
          type="button"
          className="kiosk-next"
          onClick={advance}
          disabled={pending}
          style={brandColor ? { background: brandColor, borderColor: brandColor } : undefined}
        >
          {pending ? 'One moment…' : last ? 'Done — finish' : 'Done — hand to next signer →'}
        </button>
      </footer>
    </div>
  );
}
