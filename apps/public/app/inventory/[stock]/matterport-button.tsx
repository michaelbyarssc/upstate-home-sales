'use client';

import { useCallback, useEffect, useState } from 'react';

interface MatterportButtonProps {
  url: string;
  homeName: string;
}

export function MatterportButton({ url, homeName }: MatterportButtonProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        className="btn-out"
        onClick={() => setOpen(true)}
        style={{
          fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
          fontSize: 'clamp(24px, 4vw, 56px)',
          fontWeight: 500,
          lineHeight: 1.1,
          padding: '0.18em 0.6em',
          whiteSpace: 'nowrap',
        }}
      >
        View 3D Tour
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(16px, 4vw, 48px)',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`3D tour of ${homeName}`}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 1400,
              height: '100%',
              maxHeight: 900,
              background: '#000',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close 3D tour"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 1,
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.92)',
                color: '#111',
                fontSize: 24,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              &times;
            </button>
            <iframe
              src={url}
              title={`3D tour of ${homeName}`}
              allow="xr-spatial-tracking; fullscreen; vr"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
            />
          </div>
        </div>
      )}
    </>
  );
}
