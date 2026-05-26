'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/inventory', label: 'Available Homes' },
  { href: '/financing', label: 'Financing' },
  { href: '/investors', label: 'Investors' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/portal', label: 'Buyer portal' },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="uhs-mobile-menu-toggle"
        style={{
          background: 'transparent',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-1)',
          padding: '8px 10px',
          cursor: 'pointer',
          display: 'none', // controlled via CSS below 900px
          alignItems: 'center',
          gap: 8,
          color: 'var(--c-ink)',
          fontSize: 14,
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 3,
            width: 18,
          }}
        >
          <span style={{ height: 2, background: 'currentColor', borderRadius: 1 }} />
          <span style={{ height: 2, background: 'currentColor', borderRadius: 1 }} />
          <span style={{ height: 2, background: 'currentColor', borderRadius: 1 }} />
        </span>
        Menu
      </button>

      {open && (
        <>
          {/* Backdrop — semi-transparent dim of the page. Fixed-positioned
              so it covers the whole viewport regardless of parent layout. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0,0,0,0.55)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              zIndex: 200,
            }}
          />

          {/* Drawer panel — pinned to the right, full viewport height.
              Fixed (not absolute) so it ignores ancestor containers. */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              height: '100vh',
              width: 'min(320px, 88vw)',
              background: '#ffffff',
              padding: '20px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '-12px 0 28px rgba(0,0,0,0.25)',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              zIndex: 201,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--f-display)',
                  fontSize: 18,
                  color: '#0f1c29',
                }}
              >
                Upstate Home <em style={{ color: '#7a7268' }}>Center</em>
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 28,
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: '#7a7268',
                  padding: '0 4px',
                }}
              >
                ×
              </button>
            </div>

            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '12px 10px',
                  borderRadius: 6,
                  fontSize: 16,
                  textDecoration: 'none',
                  color: '#0f1c29',
                  background: '#ffffff',
                  borderBottom: '1px solid #ece5d8',
                  minHeight: 44,
                  lineHeight: 1.4,
                }}
              >
                {l.label}
              </Link>
            ))}

            <a
              href="tel:864-680-4030"
              onClick={() => setOpen(false)}
              style={{
                marginTop: 12,
                display: 'block',
                textAlign: 'center',
                padding: '14px 16px',
                background: '#b9532a',
                color: '#ffffff',
                textDecoration: 'none',
                borderRadius: 6,
                fontSize: 16,
                fontWeight: 600,
                minHeight: 44,
              }}
            >
              Call (864) 680-4030
            </a>
          </aside>
        </>
      )}
    </>
  );
}
