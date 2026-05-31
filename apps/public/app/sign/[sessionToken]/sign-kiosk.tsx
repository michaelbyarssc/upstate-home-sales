'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { advanceSigner } from './actions';

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

  function next() {
    startTransition(async () => {
      await advanceSigner({ sessionToken });
      router.refresh();
    });
  }

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
        <iframe src={embeddedUrl} title="Sign document" allow="camera; microphone; fullscreen" />
      </div>

      <footer className="kiosk-foot">
        <p>When the {currentRoleLabel.toLowerCase()} has finished signing above, tap to continue.</p>
        <button
          type="button"
          className="kiosk-next"
          onClick={next}
          disabled={pending}
          style={brandColor ? { background: brandColor, borderColor: brandColor } : undefined}
        >
          {pending ? 'One moment…' : last ? 'Done — finish' : 'Done — hand to next signer →'}
        </button>
      </footer>
    </div>
  );
}
