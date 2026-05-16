'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/inventory', label: 'Inventory' },
  { href: '/financing', label: 'Financing' },
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
        <div
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 200,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <nav
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(320px, 88vw)',
              height: '100%',
              background: 'var(--c-surface)',
              padding: '20px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '-12px 0 28px rgba(0,0,0,0.25)',
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
                  color: 'var(--c-ink)',
                }}
              >
                Upstate Home <em style={{ color: 'var(--c-ink-mute)' }}>Center</em>
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
                  color: 'var(--c-ink-mute)',
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
                  borderRadius: 'var(--r-1)',
                  fontSize: 16,
                  textDecoration: 'none',
                  color: 'var(--c-ink)',
                  borderBottom: '1px solid var(--c-line)',
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
                background: 'var(--c-accent)',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 'var(--r-1)',
                fontSize: 16,
                fontWeight: 600,
                minHeight: 44,
              }}
            >
              Call (864) 680-4030
            </a>
          </nav>
        </div>
      )}
    </>
  );
}
